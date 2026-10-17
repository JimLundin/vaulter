import type { ToolSet } from 'ai';
import type { NodeChange } from '@/vault/nodes/store.ts';
import type {
  Calculation,
  TransactionRequest,
  TransactionStore,
} from '@/vault/transactions/store.ts';
import type { JsonValue } from '@/vault/nodes/model.ts';
import { canonical, frozen } from '@/vault/nodes/json.ts';
import { cancellable } from '@/runtime/async.ts';
import { parseToolExecution } from './schema.ts';
import { agentOperations } from './store.ts';
import type { ToolExecutionData } from './records.ts';

export interface PendingToolSave {
  readonly id: string;
  readonly node: string;
  readonly retryable: boolean;
  readonly execution: ToolExecutionData;
  readonly stage: 'invocation' | 'outcome';
}
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** Execution is wrapped here, so durable acceptance gates actual SDK effects and continuation. */
export function durableTools(options: {
  readonly nodes: TransactionStore;
  readonly tools: ToolSet;
  readonly versions: ReadonlyMap<string, string | undefined>;
  readonly agent: string;
  readonly run: string;
  readonly start: string;
  readonly signal: AbortSignal;
  readonly check: () => void;
  readonly execution: (active: boolean) => void;
  readonly changed: (node: string, data: ToolExecutionData) => void;
  readonly paused: (pending: PendingToolSave, error: unknown) => void;
  readonly recovered: () => void;
  readonly halt: () => void;
}) {
  let order = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const calls = new Map<string, { identity: string; result: Promise<unknown> }>();
  let pending:
    | {
        readonly value: PendingToolSave;
        readonly request: TransactionRequest<unknown>;
        readonly release: () => void;
      }
    | undefined;
  let retry: Promise<void> | undefined;
  // Effect completion belongs to Agent's terminal-record policy, outside write disposal.
  const effects = new Set<Promise<unknown>>();
  const publish = async <V>(calculate: Calculation<V>, signal?: AbortSignal) => {
    using writes = options.nodes
      .writer({ recordedBy: options.agent, origin: options.run })
      .lifetime({ signal });
    const request = writes.write(calculate);
    try {
      await request.result;
      return { request, failed: false as const };
    } catch (error) {
      if (!request.snapshot().finalized) throw error;
      return { request, failed: true as const, error };
    }
  };
  const pause = async (
    value: PendingToolSave,
    request: TransactionRequest<unknown>,
    error: unknown,
  ): Promise<void> => {
    let release!: () => void;
    const accepted = new Promise<void>((resolve) => {
      release = resolve;
    });
    pending = { value, request, release };
    options.paused(value, error);
    await cancellable(accepted, options.signal);
    // No effect began after an invocation whose acceptance response was uncertain.
    if (value.stage === 'invocation') {
      options.halt();
      throw new Error('Invocation was saved without execution');
    }
  };
  const tools = Object.fromEntries(
    Object.entries(options.tools).map(([name, definition]) => {
      if (!definition.execute || definition.type === 'provider')
        throw new Error('Supplied tools require module-owned execution');
      const { execute } = definition;
      return [
        name,
        {
          ...definition,
          execute: (input: unknown, executionOptions: Parameters<typeof execute>[1]) => {
            const identity = canonical({ name, input });
            const known = calls.get(executionOptions.toolCallId);
            if (known) {
              if (known.identity !== identity)
                return Promise.reject(new Error('Tool call ID reused with different contents'));
              return known.result;
            }
            const result = tail.then(async () => {
              options.check();
              const node = crypto.randomUUID();
              const started = performance.now();
              let data!: ToolExecutionData;
              let invocation!: NodeChange;
              const initial = await publish(({ id: transaction }) => {
                data = parseToolExecution({
                  kind: 'toolExecution',
                  name,
                  ...(options.versions.get(name) ? { version: options.versions.get(name) } : {}),
                  call: executionOptions.toolCallId,
                  attempt: 1,
                  started: new Date().toISOString(),
                  status: 'running',
                  input: JSON.parse(canonical(input)),
                });
                invocation = frozen({
                  node,
                  expected: null,
                  data,
                  placement: {
                    parent: options.run,
                    order: `tool-${String(order++).padStart(12, '0')}`,
                  },
                  connection: {
                    source: { node: options.run, transaction: options.start },
                    target: { node, transaction },
                  },
                });
                return {
                  value: undefined,
                  transaction: {
                    kind: agentOperations.recordTool,
                    message: null,
                    undoOf: null,
                    changes: [invocation],
                  },
                };
              }, options.signal);
              if (initial.failed)
                await pause(
                  {
                    id: initial.request.id,
                    node,
                    execution: data,
                    stage: 'invocation',
                    retryable: initial.request.snapshot().phase !== 'rejected',
                  },
                  initial.request,
                  initial.error,
                );
              options.changed(node, data);
              options.check();
              options.execution(true);
              let output: JsonValue | undefined;
              let failure: unknown;
              try {
                const value = await execute(input, executionOptions);
                // Streaming tool outputs are not an accepted immutable terminal JSON outcome.
                output = JSON.parse(canonical(value));
                data = parseToolExecution({ ...data, status: 'complete', output });
              } catch (error) {
                failure = error;
                data = parseToolExecution({
                  ...data,
                  status: options.signal.aborted ? 'cancelled' : 'failed',
                  error: { code: 'toolFailed', message: errorMessage(error) },
                });
              }
              options.execution(false);
              data = parseToolExecution({
                ...data,
                ended: new Date().toISOString(),
                elapsedMs: performance.now() - started,
              });
              const outcome = await publish(() => ({
                value: undefined,
                transaction: {
                  kind: agentOperations.completeTool,
                  message: null,
                  undoOf: null,
                  changes: [{ ...invocation, expected: initial.request.id, data }],
                },
              }));
              if (outcome.failed)
                await pause(
                  {
                    id: outcome.request.id,
                    node,
                    execution: data,
                    stage: 'outcome',
                    retryable: outcome.request.snapshot().phase !== 'rejected',
                  },
                  outcome.request,
                  outcome.error,
                );
              options.changed(node, data);
              if (failure !== undefined) throw failure;
              return output;
            });
            effects.add(result);
            void result.then(
              () => effects.delete(result),
              () => effects.delete(result),
            );
            tail = result.catch(() => undefined);
            calls.set(executionOptions.toolCallId, { identity, result });
            return result;
          },
        },
      ];
    }),
  ) as ToolSet;
  return {
    tools,
    pending: () => pending?.value,
    settle: () => Promise.allSettled([...effects]),
    retrySave: () => {
      if (retry !== undefined) return retry;
      retry = (async () => {
        const saving = pending;
        if (!saving) return;
        try {
          using writes = options.nodes
            .writer({ recordedBy: options.agent, origin: options.run })
            .lifetime();
          await writes.retry(saving.request);
          pending = undefined;
          options.recovered();
          saving.release();
        } catch (error) {
          options.paused(saving.value, error);
        }
      })().finally(() => {
        retry = undefined;
      });
      return retry;
    },
  };
}
