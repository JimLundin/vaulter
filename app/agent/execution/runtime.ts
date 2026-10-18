import { isStepCount, modelMessageSchema, type SystemModelMessage, streamText } from 'ai';
import { finishAgentRun, readAgentRun } from '@/agent/operations.ts';
import type { AgentRunRef, agentSchema, ToolExecutionRef } from '@/agent/records.ts';
import type { AgentRunData } from '@/agent/activity-data.ts';
import type { AgentBackendOptions, AgentRun, AgentRunState } from '@/agent/runtime.ts';
import { parseAgentSettings } from '@/agent/configuration.ts';
import { cancellable } from '@/runtime/async.ts';
import {
  ConflictError,
  canonical,
  type Database,
  type EntityDefinition,
  type EntityRef,
  frozen,
  SaveError,
} from '@/application/store/index.ts';
import { modelSteps } from './model-steps.ts';
import { eavTools } from './tools.ts';

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** Execute an already accepted EAV run. Reading/recovery never re-enters this function. */
export function executeEavRun(
  options: AgentBackendOptions & {
    readonly db: Pick<Database<typeof agentSchema>, 'entities' | 'transaction' | 'refresh'>;
    readonly run: AgentRunRef;
  },
) {
  const abort = new AbortController();
  let disposed = false;
  let live = true;
  let interrupted = false;
  let interruptedReason = 'invocationNotExecuted';
  let tools: ReturnType<typeof eavTools> | undefined;
  let steps: ReturnType<typeof modelSteps> | undefined;
  let pending: SaveError | undefined;
  let terminal: AgentRunData | undefined;
  let author: EntityRef<EntityDefinition> | undefined;
  let state: AgentRunState = {
    phase: 'accepting',
    text: '',
    data: {
      kind: 'agentRun',
      status: 'running',
      started: new Date().toISOString(),
      provider: '',
      model: { requested: '' },
      settings: {},
      enabledTools: [],
    },
  };
  const listeners = new Set<() => void>();
  const receipts = new Map<string, ToolExecutionRef>();
  const notify = (patch: Partial<AgentRunState>) => {
    if (disposed) return;
    state = frozen({ ...state, ...patch });
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* Observers cannot reject execution. */
      }
    }
  };
  const check = () => {
    if (disposed || abort.signal.aborted || !live)
      throw new DOMException('Agent stopped', 'AbortError');
  };
  const finish = async () => {
    if (disposed || !terminal || tools?.pending() || tools?.contentPending() || steps?.pending())
      return;
    try {
      await options.db.transaction({ author, origin: options.run }, async (tx) => {
        const run = await tx.entities.agentRuns.get(options.run, { select: { status: true } });
        if (run?.status !== 'running') return;
        await finishAgentRun(tx, options.run, {
          status: terminal!.status === 'running' ? 'interrupted' : terminal!.status,
          endedAt: new Date(terminal!.ended!),
          ...(terminal!.output && { output: JSON.parse(canonical(terminal!.output)) }),
          ...(terminal!.error && { error: terminal!.error }),
          ...(terminal!.model.served && { servedModel: terminal!.model.served }),
          ...(terminal!.request && { request: terminal!.request }),
          ...(terminal!.finishReason && { finishReason: terminal!.finishReason }),
          ...(terminal!.usage && {
            inputTokens: terminal!.usage.input,
            outputTokens: terminal!.usage.output,
          }),
        });
      });
      notify({
        phase: terminal.status === 'running' ? 'recorded' : terminal.status,
        data: terminal,
        persistenceError: undefined,
        persistenceStage: undefined,
      });
    } catch (error) {
      if (error instanceof SaveError) pending = error;
      notify({
        phase: 'unsaved',
        data: terminal,
        persistenceError: errorText(error),
        persistenceStage: 'terminal',
      });
    }
  };
  const done = (async () => {
    try {
      const run = await options.db.transaction((tx) => readAgentRun(tx, options.run));
      if (!run || run.status !== 'running')
        throw new Error('Agent run is not available for execution');
      author = run.author;
      steps = modelSteps({
        db: options.db,
        run: options.run,
        author,
        configuration: {
          provider: run.provider,
          model: run.requestedModel,
          settings: run.settings,
          tools: run.tools.map(({ name, version }) => ({ name, version })),
        },
        failed: (error) => {
          interrupted = true;
          live = false;
          abort.abort();
          notify({
            phase: 'unsaved',
            persistenceStage: 'terminal',
            persistenceError: errorText(error),
          });
        },
      });
      const settings = parseAgentSettings(run.settings);
      const initial: AgentRunData = {
        kind: 'agentRun',
        status: 'running',
        started: run.startedAt.toISOString(),
        provider: run.provider,
        model: { requested: run.requestedModel },
        settings,
        enabledTools: run.tools.map(({ name, version }) => ({ name, version })),
      };
      notify({ data: initial, phase: 'running' });
      let data = initial;
      let text = '';
      let output: AgentRunData['output'];
      try {
        check();
        const supplied = options.tools
          ? await cancellable(
              Promise.resolve(
                options.tools({
                  signal: abort.signal,
                  author: run.author,
                  run: options.run,
                }),
              ),
              abort.signal,
            )
          : {};
        tools = eavTools({
          db: options.db,
          run: options.run,
          author: run.author,
          tools: supplied,
          enabled: run.tools,
          signal: abort.signal,
          step: () => steps?.current(),
          check,
          changed: (key, value, entity) => {
            receipts.set(key, entity);
            notify({
              tools: [...(state.tools ?? [])]
                .filter((item) => item.node !== key)
                .concat({ node: key, data: value }),
            });
          },
          paused: (value, error) =>
            notify({
              phase: 'paused',
              pendingTool: value,
              persistenceStage: value.stage,
              persistenceError: errorText(error),
            }),
          recovered: () =>
            notify({
              phase: abort.signal.aborted ? 'saving' : 'running',
              pendingTool: undefined,
              persistenceStage: undefined,
              persistenceError: undefined,
            }),
          contentFailed: (id, error) =>
            notify({ contentPersistence: { id, error: errorText(error) } }),
          contentRecovered: (id) => {
            interruptedReason = 'contentSaveUncertain';
            notify({ contentPersistence: undefined, contentAccepted: id });
          },
          halt: () => {
            interrupted = true;
            live = false;
            abort.abort();
          },
        });
        const effective = run.inputs
          .map(({ role, content }) =>
            typeof content === 'string'
              ? { role, content }
              : content && typeof content === 'object' && 'message' in content
                ? content.message
                : { role, content },
          )
          .map((value) => modelMessageSchema.parse(value));
        const instructions = effective.filter(
          (item): item is SystemModelMessage => item.role === 'system',
        );
        const messages = effective.filter((item) => item.role !== 'system');
        if (options.execution) {
          const result = await cancellable(
            options.execution({
              messages,
              instructions,
              tools: tools.tools,
              signal: abort.signal,
              progress: (value, details) => {
                if (!abort.signal.aborted) {
                  text = value;
                  output = details;
                  notify({ text });
                }
              },
            }),
            abort.signal,
          );
          ({ text, output } = result);
          data = {
            ...data,
            status: result.status,
            ...(result.status === 'failed'
              ? {
                  error: {
                    code: 'executionFailed',
                    message: 'The provider reported a failed execution',
                  },
                }
              : {}),
            ...(result.model && { model: { ...data.model, served: result.model } }),
            ...(result.request && { request: result.request }),
          };
        } else {
          if (!options.model) throw new Error('Agent requires an execution provider');
          const model = await cancellable(options.model(run.requestedModel), abort.signal);
          check();
          const stream = streamText({
            ...settings,
            model,
            tools: tools.tools,
            instructions,
            messages,
            stopWhen: isStepCount(typeof settings.maxSteps === 'number' ? settings.maxSteps : 1),
            abortSignal: abort.signal,
            prepareStep: async ({ messages: effectiveMessages }) => {
              check();
              await steps!.before(
                JSON.parse(JSON.stringify([...instructions, ...effectiveMessages])),
              );
              check();
            },
            onStepFinish: async (response) => {
              await steps!.after(
                JSON.parse(
                  JSON.stringify({
                    messages: response.response.messages.filter(
                      (message) => message.role === 'assistant',
                    ),
                    model: response.response.modelId,
                    request: response.response.id,
                    finishReason: response.finishReason,
                    usage: response.usage,
                  }),
                ),
              );
            },
          });
          const iterator = stream.fullStream[Symbol.asyncIterator]();
          for (;;) {
            // biome-ignore lint/performance/noAwaitInLoops: Preserve provider stream order.
            const next = await cancellable(iterator.next(), abort.signal);
            if (next.done) break;
            const event = next.value;
            if (event.type === 'text-delta') {
              text += event.text;
              notify({ text });
            }
            if (event.type === 'error') throw event.error;
            if (event.type === 'finish-step')
              data = {
                ...data,
                model: { ...data.model, served: event.response.modelId },
                ...(event.response.id && { request: event.response.id }),
              };
            if (event.type === 'finish')
              data = {
                ...data,
                finishReason: event.finishReason,
                usage: {
                  input: event.totalUsage.inputTokens ?? 0,
                  output: event.totalUsage.outputTokens ?? 0,
                },
              };
          }
          data = { ...data, status: 'complete' };
        }
      } catch (error) {
        data = {
          ...data,
          status: interrupted ? 'interrupted' : abort.signal.aborted ? 'stopped' : 'failed',
          ...(!abort.signal.aborted && {
            error: { code: 'executionFailed', message: errorText(error) },
          }),
        };
      }
      live = false;
      await tools?.settle();
      try {
        if (!tools?.contentPending()) await steps?.stopOpen(data.error);
      } catch {
        /* The exact save is retained by the step owner. */
      }
      terminal = {
        ...data,
        status: interrupted ? 'interrupted' : abort.signal.aborted ? 'stopped' : data.status,
        ended: new Date().toISOString(),
        output: { ...output, text },
        ...(interrupted ? { finishReason: interruptedReason } : {}),
      };
      notify({
        text,
        data: terminal,
        ...(tools?.contentPending() ? { phase: terminal.status } : {}),
      });
      await finish();
    } catch (error) {
      notify({ phase: 'failed', persistenceError: errorText(error) });
    }
    return state;
  })();
  let retry: Promise<AgentRunState> | undefined;
  const handle: AgentRun & {
    readonly receipts: () => readonly ToolExecutionRef[];
    readonly dispose: () => void;
  } = {
    snapshot: () => state,
    done,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    receipts: () => [...receipts.values()],
    stop: () => {
      live = false;
      abort.abort();
    },
    retrySave: () => {
      retry ??= (async () => {
        if (disposed) return state;
        if (steps?.pending()) {
          try {
            await steps.retry();
            await steps.stopOpen();
          } catch (error) {
            notify({ persistenceError: errorText(error) });
            return state;
          }
        }
        if (tools?.pending()) {
          await tools.retrySave();
          if (!abort.signal.aborted) return state;
        }
        await done;
        if (tools?.pending()) return state;
        try {
          if (pending) {
            try {
              await pending.retry();
            } catch (error) {
              // A definitive conflict permits recording the retained result on a fresh snapshot.
              if (!(error instanceof ConflictError)) throw error;
            }
            pending = undefined;
          }
          await finish();
        } catch (error) {
          notify({ persistenceError: errorText(error) });
        }
        return state;
      })().finally(() => {
        retry = undefined;
      });
      return retry;
    },
    retryContentSave: async () => {
      await tools?.retryContentSave();
      if (tools?.contentPending()) return state;
      await done;
      try {
        await steps?.stopOpen(terminal?.error);
      } catch (error) {
        notify({ persistenceError: errorText(error), persistenceStage: 'terminal' });
        return state;
      }
      await finish();
      return state;
    },
    refreshContext: async () => {
      try {
        await options.db.refresh();
        notify({ contextError: undefined });
      } catch (error) {
        notify({ contextError: errorText(error) });
      }
      return state;
    },
    dispose: () => {
      disposed = true;
      live = false;
      abort.abort();
      listeners.clear();
    },
  };
  return handle;
}
