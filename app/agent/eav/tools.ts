import type { ToolSet } from 'ai';
import {
  SaveError,
  ConflictError,
  type Database,
  type EntityRef,
  type EntityDefinition,
} from '../../vault/eav/index.ts';
import { cancellable } from '../../runtime/async.ts';
import { canonical } from '../../vault/nodes/json.ts';
import { startToolExecution, finishToolExecution, type ToolOutcome } from '../data/operations.ts';
import type {
  agentSchema,
  AgentRunRef,
  RunToolRef,
  ToolExecutionRef,
  ModelStepRef,
} from '../data/schema.ts';
import type { ToolExecutionData } from '../records.ts';
import type { PendingToolSave } from '../tool-execution.ts';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
export function eavTools(options: {
  readonly db: Pick<Database<typeof agentSchema>, 'entities' | 'transaction' | 'refresh'>;
  readonly run: AgentRunRef;
  readonly author: EntityRef<EntityDefinition>;
  readonly tools: ToolSet;
  readonly enabled: readonly (RunToolRef & { readonly name: string; readonly version: string })[];
  readonly signal: AbortSignal;
  readonly step?: () => ModelStepRef | undefined;
  readonly check: () => void;
  readonly execution: (active: boolean) => void;
  readonly changed: (key: string, value: ToolExecutionData, entity: ToolExecutionRef) => void;
  readonly paused: (pending: PendingToolSave, error: unknown) => void;
  readonly recovered: () => void;
  readonly halt: () => void;
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
                options.execution(true);
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
                    error: { code: 'toolFailed', message: message(error) },
                  };
                } finally {
                  options.execution(false);
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
  ) as ToolSet;
  if (Object.keys(tools).length !== options.enabled.length)
    throw new Error('Supplied tools differ from accepted capabilities');
  return {
    tools,
    pending: () => pending?.value,
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
