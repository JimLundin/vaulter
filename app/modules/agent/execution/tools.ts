import type { ToolSet } from 'ai';
import {
  finishToolExecution,
  startToolExecution,
  type ToolOutcome,
} from '@/modules/agent/operations.ts';
import type {
  AgentRunRef,
  agentSchema,
  ModelStepRef,
  RunToolRef,
  ToolExecutionRef,
} from '@/modules/agent/records.ts';
import type { ToolExecutionData } from '@/modules/agent/activity-data.ts';
import type { PendingToolSave } from '@/modules/agent/runtime.ts';
import { cancellable } from '@/shared/async/async.ts';
import {
  ConflictError,
  canonical,
  type Database,
  type EntityDefinition,
  type EntityRef,
  SaveError,
} from '@/core/store/index.ts';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
export function eavTools<T extends ToolSet>(options: {
  readonly db: Pick<Database<typeof agentSchema>, 'entities' | 'transaction' | 'refresh'>;
  readonly run: AgentRunRef;
  readonly author: EntityRef<EntityDefinition>;
  readonly tools: T;
  readonly enabled: readonly (RunToolRef & { readonly name: string; readonly version: string })[];
  readonly signal: AbortSignal;
  readonly step?: () => ModelStepRef | undefined;
  readonly check: () => void;
  readonly changed: (key: string, value: ToolExecutionData, entity: ToolExecutionRef) => void;
  readonly paused: (pending: PendingToolSave, error: unknown) => void;
  readonly recovered: () => void;
  readonly halt: () => void;
  readonly contentFailed?: (id: string, error: unknown) => void;
  readonly contentRecovered?: (id: string) => void;
}) {
  let tail: Promise<unknown> = Promise.resolve();
  const calls = new Map<string, { identity: string; result: Promise<unknown> }>();
  const effects = new Set<Promise<unknown>>();
  let pending:
    | {
        save: () => Promise<void>;
        value: PendingToolSave;
        release: () => void;
        recoverStopped: () => Promise<void>;
      }
    | undefined;
  let retry: Promise<void> | undefined;
  let contentSave:
    | { id: string; error: SaveError; release: () => void; record: () => Promise<void> }
    | undefined;
  let contentRetry: Promise<void> | undefined;
  const pause = async (
    error: SaveError | ConflictError,
    write: () => Promise<unknown>,
    value: PendingToolSave,
    recoverStopped: () => Promise<void>,
  ) => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    let failure: unknown = error;
    const save = async () => {
      try {
        if (failure instanceof SaveError) await failure.retry();
        else {
          await options.db.refresh();
          await write();
        }
      } catch (next) {
        failure = next;
        throw next;
      }
    };
    pending = { save, value, release, recoverStopped };
    options.paused(value, error);
    await cancellable(ready, options.signal);
  };
  const tools = Object.fromEntries(
    Object.entries(options.tools).map(([name, definition]) => {
      const enabled = options.enabled.find((tool) => tool.name === name);
      if (!(enabled && definition.execute) || definition.type === 'provider')
        throw new Error('Tools must match accepted module-owned capabilities');
      const execute = definition.execute;
      return [
        name,
        {
          ...definition,
          execute: (input: unknown, context: Parameters<typeof execute>[1]) => {
            const identity = canonical({ name, input });
            const previous = calls.get(context.toolCallId);
            if (previous) {
              if (previous.identity !== identity)
                return Promise.reject(new Error('Tool call identity was reused'));
              return previous.result;
            }
            const result = tail.then(async () => {
              if (contentSave) throw new Error('Content publication requires recovery');
              options.check();
              const key = context.toolCallId;
              let entity!: ToolExecutionRef;
              let data: ToolExecutionData = {
                kind: 'toolExecution',
                call: key,
                name,
                version: enabled.version,
                attempt: 1,
                started: new Date().toISOString(),
                status: 'running',
                input: JSON.parse(canonical(input)),
              };
              let interrupted = false;
              const saveInvocation = () =>
                options.db.transaction(
                  { author: options.author, origin: options.run },
                  async (tx) => {
                    entity = await startToolExecution(tx, enabled, {
                      call: key,
                      step: options.step?.(),
                      startedAt: new Date(data.started),
                      input: JSON.parse(canonical(input)),
                    });
                  },
                );
              try {
                await saveInvocation();
              } catch (error) {
                if (!(error instanceof SaveError || error instanceof ConflictError)) throw error;
                interrupted = true;
                try {
                  let cancellationSave: SaveError | undefined;
                  const cancelled: ToolOutcome = {
                    status: 'cancelled',
                    endedAt: new Date(),
                    error: {
                      code: 'invocationNotExecuted',
                      message: 'Invocation was saved without execution',
                    },
                  };
                  await pause(
                    error,
                    saveInvocation,
                    {
                      id: key,
                      node: key,
                      execution: data,
                      stage: 'invocation',
                      retryable: true,
                    },
                    async () => {
                      if (cancellationSave) await cancellationSave.retry();
                      else {
                        try {
                          await options.db.transaction(
                            { author: options.author, origin: options.run },
                            (tx) => finishToolExecution(tx, entity, cancelled),
                          );
                        } catch (failure) {
                          if (failure instanceof SaveError) cancellationSave = failure;
                          throw failure;
                        }
                      }
                      options.changed(
                        key,
                        {
                          ...data,
                          status: 'cancelled',
                          ended: cancelled.endedAt.toISOString(),
                          error: cancelled.error,
                        },
                        entity,
                      );
                    },
                  );
                } finally {
                  options.halt();
                }
              }
              options.changed(key, data, entity);
              let outcome: ToolOutcome;
              let output: unknown;
              let failure: unknown;
              if (interrupted || options.signal.aborted) {
                outcome = {
                  status: 'cancelled',
                  endedAt: new Date(),
                  error: {
                    code: 'invocationNotExecuted',
                    message: 'Invocation was saved without execution',
                  },
                };
              } else {
                options.check();
                try {
                  output = await execute(input, context);
                  outcome = {
                    status: 'complete',
                    endedAt: new Date(),
                    output: JSON.parse(canonical(output)),
                  };
                } catch (error) {
                  failure = error;
                  outcome = {
                    status: options.signal.aborted ? 'cancelled' : 'failed',
                    endedAt: new Date(),
                    error: {
                      code: error instanceof SaveError ? 'contentSaveUncertain' : 'toolFailed',
                      message: message(error),
                    },
                  };
                  if (error instanceof SaveError) {
                    const failed = outcome;
                    const { endedAt: failedAt, ...failureData } = failed;
                    const failedData: ToolExecutionData = {
                      ...data,
                      ...failureData,
                      ended: failedAt.toISOString(),
                    };
                    let release!: () => void;
                    const accepted = new Promise<void>((resolve) => {
                      release = resolve;
                    });
                    let receiptSave: SaveError | undefined;
                    contentSave = {
                      id: key,
                      error,
                      release,
                      record: async () => {
                        if (receiptSave) await receiptSave.retry();
                        else
                          try {
                            await options.db.transaction(
                              { author: options.author, origin: options.run },
                              (tx) => finishToolExecution(tx, entity, failed),
                            );
                          } catch (failure) {
                            if (failure instanceof SaveError) receiptSave = failure;
                            throw failure;
                          }
                        options.changed(key, failedData, entity);
                      },
                    };
                    options.contentFailed?.(key, error);
                    await cancellable(accepted, options.signal);
                  }
                }
              }
              const { endedAt, ...resultData } = outcome;
              data = {
                ...data,
                ...resultData,
                ended: endedAt.toISOString(),
                elapsedMs: endedAt.getTime() - Date.parse(data.started),
              };
              const saveOutcome = () =>
                options.db.transaction({ author: options.author, origin: options.run }, (tx) =>
                  finishToolExecution(tx, entity, outcome),
                );
              try {
                await saveOutcome();
              } catch (error) {
                if (!(error instanceof SaveError || error instanceof ConflictError)) throw error;
                await pause(
                  error,
                  saveOutcome,
                  {
                    id: key,
                    node: key,
                    execution: data,
                    stage: 'outcome',
                    retryable: true,
                  },
                  () => {
                    options.changed(key, data, entity);
                    return Promise.resolve();
                  },
                );
              }
              options.changed(key, data, entity);
              if (failure !== undefined) throw failure;
              if (interrupted) throw new Error('Invocation was saved without execution');
              return output;
            });
            calls.set(context.toolCallId, { identity, result });
            effects.add(result);
            void result.then(
              () => effects.delete(result),
              () => effects.delete(result),
            );
            tail = result.catch(() => undefined);
            return result;
          },
        },
      ];
    }),
  ) as T;
  if (Object.keys(tools).length !== options.enabled.length)
    throw new Error('Supplied tools differ from accepted capabilities');
  return {
    tools,
    pending: () => pending?.value,
    contentPending: () => !!contentSave,
    retryContentSave: () => {
      contentRetry ??= (async () => {
        const retained = contentSave;
        if (!retained) return;
        try {
          await retained.error.retry();
          await retained.record();
          contentSave = undefined;
          options.halt();
          retained.release();
          options.contentRecovered?.(retained.id);
        } catch (error) {
          options.contentFailed?.(retained.id, error);
        }
      })().finally(() => {
        contentRetry = undefined;
      });
      return contentRetry;
    },
    settle: () => Promise.allSettled([...effects]),
    retrySave: () => {
      retry ??= (async () => {
        const retained = pending;
        if (!retained) return;
        try {
          await retained.save();
          if (options.signal.aborted) await retained.recoverStopped();
          pending = undefined;
          options.recovered();
          retained.release();
        } catch (error) {
          options.paused(retained.value, error);
        }
      })().finally(() => {
        retry = undefined;
      });
      return retry;
    },
  };
}
