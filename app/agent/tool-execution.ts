import type { ToolSet } from 'ai';
import type { NodeCommit, NodeStore } from '../vault/nodes/store.ts';
import type { JsonValue } from '../vault/nodes/model.ts';
import { canonical, frozen } from '../vault/nodes/json.ts';
import { cancellable } from '../vault/storage/coordination.ts';
import { parseToolExecution } from './schema.ts';
import { agentOperations } from './store.ts';
import type { ToolExecutionData } from './records.ts';

export interface PendingToolSave {
  readonly request: NodeCommit;
  readonly execution: ToolExecutionData;
  readonly stage: 'invocation' | 'outcome';
}
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** Execution is wrapped here, so durable acceptance gates actual SDK effects and continuation. */
export function durableTools(options: {
  readonly nodes: NodeStore;
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
}) {
  let order = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const calls = new Map<string, { identity: string; result: Promise<unknown> }>();
  const pause = async (pending: PendingToolSave, error: unknown): Promise<never> => {
    options.paused(pending, error);
    // #38 supplies persistence-only retry and resumes this acceptance gate.
    return await cancellable(
      new Promise<never>(() => {
        /* Durable outcome is pending. */
      }),
      options.signal,
    );
  };
  return Object.fromEntries(
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
              const transaction = crypto.randomUUID();
              const started = performance.now();
              let data = parseToolExecution({
                kind: 'toolExecution',
                name,
                ...(options.versions.get(name) ? { version: options.versions.get(name) } : {}),
                call: executionOptions.toolCallId,
                attempt: 1,
                started: new Date().toISOString(),
                status: 'running',
                input: JSON.parse(canonical(input)),
              });
              const invocation: NodeCommit = frozen({
                id: transaction,
                recordedBy: options.agent,
                origin: options.run,
                kind: agentOperations.recordTool,
                message: null,
                undoOf: null,
                changes: [
                  {
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
                  },
                ],
              });
              try {
                await options.nodes.commit(invocation);
              } catch (error) {
                return await pause(
                  { request: invocation, execution: data, stage: 'invocation' },
                  error,
                );
              }
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
              const outcome: NodeCommit = frozen({
                ...invocation,
                id: crypto.randomUUID(),
                kind: agentOperations.completeTool,
                changes: [{ ...invocation.changes[0]!, expected: invocation.id, data }],
              });
              try {
                await options.nodes.commit(outcome);
              } catch (error) {
                return await pause({ request: outcome, execution: data, stage: 'outcome' }, error);
              }
              options.changed(node, data);
              if (failure !== undefined) throw failure;
              return output;
            });
            tail = result.catch(() => undefined);
            calls.set(executionOptions.toolCallId, { identity, result });
            return result;
          },
        },
      ];
    }),
  ) as ToolSet;
}
