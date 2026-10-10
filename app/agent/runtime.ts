// Independent browser Agent lifetime. Callers own context assembly and presentation.
import { streamText, isStepCount } from 'ai';
import type { ModelMessage, SystemModelMessage } from 'ai';
import type { NodeCommit, NodeStore } from '../vault/nodes/store.ts';
import { canonical, frozen, compare } from '../vault/nodes/json.ts';
import { cancellable } from '../vault/storage/coordination.ts';
import type { LanguageModelProvider } from './providers.ts';
import { agentContentContext } from './tool-context.ts';
import { durableTools } from './tool-execution.ts';
import type { PendingToolSave } from './tool-execution.ts';
import type { AgentToolFactory, ContentWritePolicy } from './tools.ts';
import type { AgentRunData, ToolExecutionData } from './records.ts';
import { parseAgentRun, parseContextInput, parseAgentSettings } from './schema.ts';
import { prepareAgentOutcome, readAgentRun, verifyAgentAcceptance } from './store.ts';
import type { PreparedAgentRun } from './store.ts';
import { agentOwnership } from './ownership.ts';

export interface AgentRunState {
  readonly phase:
    | 'accepting'
    | 'running'
    | 'saving'
    | 'complete'
    | 'stopped'
    | 'failed'
    | 'interrupted'
    | 'unsaved'
    | 'recorded'
    | 'paused';
  readonly data: AgentRunData;
  readonly text: string;
  readonly persistenceError?: string;
  readonly persistenceStage?: 'initial' | 'invocation' | 'content' | 'outcome' | 'terminal';
  readonly tools?: readonly { readonly node: string; readonly data: ToolExecutionData }[];
  readonly pendingTool?: PendingToolSave;
  readonly contextError?: string;
  readonly contentPersistence?: { readonly request: NodeCommit; readonly error: string };
}
export interface AgentRun {
  readonly snapshot: () => AgentRunState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly done: Promise<AgentRunState>;
  readonly stop: () => void;
  /** Persistence only: never repeat or resume execution. */
  readonly retrySave: () => Promise<AgentRunState>;
}
export interface AgentBackendOptions {
  readonly nodes: NodeStore;
  readonly model: LanguageModelProvider;
  readonly tools?: AgentToolFactory;
  readonly writableKinds?: readonly string[];
  readonly contentPolicy?: ContentWritePolicy;
}
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createAgentBackend(options: AgentBackendOptions) {
  const runs = new Map<string, { identity: string; handle: AgentRun }>();
  const ownership = agentOwnership(options.nodes);
  let disposed = false;
  function start(input: PreparedAgentRun): AgentRun {
    if (disposed) throw new Error('Agent backend is disposed');
    const prepared = frozen(structuredClone(input));
    const identity = canonical(prepared);
    const known = runs.get(prepared.commit.id);
    if (known) {
      if (known.identity !== identity) throw new Error('Request ID reused with different contents');
      return known.handle;
    }
    const initial = prepared.commit.changes.find((change) => change.node === prepared.run);
    if (!initial || initial.expected !== null) throw new Error('Agent start requires a new run');
    const initialData = parseAgentRun(initial.data);
    if (initialData.status !== 'running')
      throw new Error('Agent start requires a running initial record');
    parseAgentSettings(initialData.settings);
    const abort = new AbortController();
    const listeners = new Set<() => void>();
    let state: AgentRunState = frozen({ phase: 'accepting', data: initialData, text: '' });
    let pending: NodeCommit | undefined;
    let initialSave = false;
    let toolPending: PendingToolSave | undefined;
    let toolController: ReturnType<typeof durableTools> | undefined;
    let settleContent: (() => Promise<unknown>) | undefined;
    let interrupted = false;
    let terminal: (() => Promise<AgentRunState>) | undefined;
    let terminalWork: Promise<AgentRunState> | undefined;
    let live = true;
    let executingTool = false;
    const activity = new Map<string, ToolExecutionData>();
    let retry: Promise<AgentRunState> | undefined;
    const notify = (next: AgentRunState) => {
      state = frozen(structuredClone(next));
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          /* Observers cannot reject accepted work. */
        }
      }
    };
    const restored = async () => {
      const saved = await readAgentRun(options.nodes, prepared.run);
      if (!saved) throw new Error('Accepted Agent run is unavailable');
      notify({
        phase: saved.data.status === 'running' ? 'recorded' : saved.data.status,
        data: saved.data,
        tools: saved.tools.map(({ version, data }) => ({ node: version.key.node, data })),
        text: typeof saved.data.output?.text === 'string' ? saved.data.output.text : '',
      });
    };
    const done = (async () => {
      try {
        const existing = await readAgentRun(options.nodes, prepared.run);
        if (existing) {
          // The adapter validates the full retry identity, including caller-composed changes.
          await options.nodes.commit(prepared.commit);
          await verifyAgentAcceptance(options.nodes, prepared);
          await restored();
          return state;
        }
        if (abort.signal.aborted) {
          notify({ phase: 'stopped', data: { ...initialData, status: 'stopped' }, text: '' });
          return state;
        }
        pending = prepared.commit;
        initialSave = true;
        try {
          await options.nodes.commit(pending);
          pending = undefined;
          initialSave = false;
        } catch (error) {
          notify({
            ...state,
            phase: 'unsaved',
            persistenceError: errorMessage(error),
            persistenceStage: 'initial',
          });
          return state;
        }
        let text = '';
        let data = initialData;
        const started = performance.now();
        try {
          if (abort.signal.aborted) throw new Error('Agent stopped');
          notify({ phase: 'running', data, text });
          const languageModel = await cancellable(
            options.model(data.model.requested),
            abort.signal,
          );
          if (abort.signal.aborted) throw new Error('Agent stopped');
          const guard = agentContentContext({
            nodes: options.nodes,
            agent: initial.connection!.target.node,
            run: prepared.run,
            signal: abort.signal,
            live: () => live && !disposed,
            executing: () => executingTool,
            writableKinds: options.writableKinds ?? [],
            contentPolicy: options.contentPolicy,
            snapshot: await options.nodes.snapshot(),
            publicationFailed: (request, error) => {
              notify({
                ...state,
                persistenceStage: 'content',
                contentPersistence: { request, error: errorMessage(error) },
              });
            },
            refreshFailed: (error) => {
              notify({ ...state, contextError: errorMessage(error) });
            },
          });
          const supplied = options.tools
            ? await cancellable(Promise.resolve(options.tools(guard.context)), abort.signal)
            : {};
          const selected = initialData.enabledTools.map(({ name }) => name).sort(compare);
          if (canonical(Object.keys(supplied).sort(compare)) !== canonical(selected))
            throw new Error('Supplied tools do not match accepted enabled tools');
          settleContent = guard.settle;
          toolController = durableTools({
            nodes: options.nodes,
            tools: supplied,
            versions: new Map(initialData.enabledTools.map(({ name, version }) => [name, version])),
            agent: initial.connection!.target.node,
            run: prepared.run,
            start: prepared.commit.id,
            signal: abort.signal,
            check: guard.check,
            execution: (active) => {
              executingTool = active;
            },
            changed: (node, execution) => {
              activity.set(node, execution);
              notify({
                ...state,
                tools: [...activity].map(([toolNode, toolData]) => ({
                  node: toolNode,
                  data: toolData,
                })),
              });
            },
            recovered: () => {
              toolPending = undefined;
              const {
                pendingTool: _pending,
                persistenceError: _error,
                persistenceStage: _stage,
                ...rest
              } = state;
              notify({ ...rest, phase: abort.signal.aborted ? 'saving' : 'running' });
            },
            halt: () => {
              interrupted = true;
              live = false;
              abort.abort();
            },
            paused: (pendingSave, error) => {
              toolPending = pendingSave;
              notify({
                ...state,
                phase: 'paused',
                pendingTool: pendingSave,
                persistenceStage: pendingSave.stage,
                persistenceError: errorMessage(error),
              });
            },
          });
          const context = prepared.commit.changes
            .filter(
              (change) =>
                change.data?.kind === 'contextInput' && change.placement?.parent === prepared.run,
            )
            .map((change) => parseContextInput(change.data))
            .sort((left, right) => left.position - right.position);
          const effective = context.map(({ role, content }) => {
            if (typeof content === 'string') return { role, content };
            const { message } = content;
            if (
              message &&
              typeof message === 'object' &&
              !Array.isArray(message) &&
              'role' in message &&
              message.role === role
            )
              return message;
            throw new Error('Structured context must retain its effective message');
          }) as ModelMessage[];
          const instructions = effective.filter(
            (message): message is SystemModelMessage => message.role === 'system',
          );
          const messages = effective.filter((message) => message.role !== 'system');
          const stream = streamText({
            ...data.settings,
            tools: toolController.tools,
            stopWhen: isStepCount(
              typeof data.settings.maxSteps === 'number' ? data.settings.maxSteps : 1,
            ),
            model: languageModel,
            messages,
            instructions,
            abortSignal: abort.signal,
          });
          const iterator = stream.fullStream[Symbol.asyncIterator]();
          for (;;) {
            // biome-ignore lint/performance/noAwaitInLoops: output order depends on each streamed event.
            const next = await cancellable(iterator.next(), abort.signal);
            if (next.done) break;
            const event = next.value;
            if (event.type === 'text-delta') {
              text += event.text;
              notify({
                ...state,
                phase: state.phase === 'paused' ? 'paused' : 'running',
                data,
                text,
              });
            }
            if (event.type === 'error') throw event.error;
            if (event.type === 'finish-step') {
              data = {
                ...data,
                ...(event.response.modelId
                  ? { model: { ...data.model, served: event.response.modelId } }
                  : {}),
                ...(event.response.id ? { request: event.response.id } : {}),
              };
            }
            if (event.type === 'finish') {
              data = {
                ...data,
                finishReason: event.finishReason,
                usage: {
                  input: event.totalUsage.inputTokens ?? 0,
                  output: event.totalUsage.outputTokens ?? 0,
                },
              };
            }
          }
          data = { ...data, status: abort.signal.aborted ? 'stopped' : 'complete' };
        } catch (error) {
          data = {
            ...data,
            status: abort.signal.aborted ? 'stopped' : 'failed',
            ...(!abort.signal.aborted
              ? { error: { code: 'executionFailed', message: errorMessage(error) } }
              : {}),
          };
        }
        live = false;
        await toolController?.settle();
        await settleContent?.();
        data = {
          ...data,
          status: interrupted ? 'interrupted' : abort.signal.aborted ? 'stopped' : data.status,
          ...(interrupted ? { finishReason: 'invocationNotExecuted' } : {}),
        };
        terminal = () => {
          if (terminalWork !== undefined) return terminalWork;
          terminalWork = (async () => {
            if (toolPending) return state;
            const terminalData = parseAgentRun({
              ...data,
              ended: new Date().toISOString(),
              timing: { elapsedMs: performance.now() - started },
              output: { text },
            });
            pending = prepareAgentOutcome(prepared, terminalData);
            notify({
              ...state,
              phase: 'saving',
              data: terminalData,
              text,
              tools: [...activity].map(([node, toolData]) => ({ node, data: toolData })),
            });
            try {
              await options.nodes.commit(pending);
              pending = undefined;
              notify({
                ...state,
                phase: terminalData.status === 'running' ? 'recorded' : terminalData.status,
                data: terminalData,
                text,
              });
            } catch (error) {
              notify({
                ...state,
                phase: 'unsaved',
                data: terminalData,
                text,
                persistenceError: errorMessage(error),
                persistenceStage: 'terminal',
              });
            }
            return state;
          })();
          return terminalWork;
        };
        if (toolPending) {
          notify({
            ...state,
            phase: 'paused',
            data,
            pendingTool: toolPending,
          });
          return state;
        }
        await terminal();
      } catch (error) {
        notify({
          phase: 'failed',
          data: {
            ...initialData,
            status: 'failed',
            error: { code: 'invalidRequest', message: errorMessage(error) },
          },
          text: '',
        });
      }
      return state;
    })();
    const handle: AgentRun = {
      snapshot: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      done,
      stop: () => {
        live = false;
        abort.abort();
      },
      retrySave: () => {
        if (retry !== undefined) return retry;
        retry = (async () => {
          if (toolController?.pending()) {
            await toolController.retrySave();
            if (!toolController.pending() && abort.signal.aborted) {
              await done;
              if (terminal) await terminal();
            }
            return state;
          }
          await done;
          if (!pending || disposed) return state;
          try {
            await options.nodes.commit(pending);
            pending = undefined;
            if (initialSave) {
              initialSave = false;
              await restored();
            } else
              notify({
                ...(state.contextError ? { contextError: state.contextError } : {}),
                ...(state.contentPersistence
                  ? {
                      contentPersistence: state.contentPersistence,
                      persistenceStage: 'content' as const,
                    }
                  : {}),
                tools: state.tools,
                phase: state.data.status === 'running' ? 'recorded' : state.data.status,
                data: state.data,
                text: state.text,
              });
          } catch (error) {
            notify({ ...state, persistenceError: errorMessage(error) });
          }
          return state;
        })().finally(() => {
          retry = undefined;
        });
        return retry;
      },
    };
    runs.set(prepared.commit.id, { identity, handle });
    return handle;
  }
  return {
    start: (input: PreparedAgentRun) => {
      if (disposed) throw new Error('Agent backend is disposed');
      const prepared = frozen(structuredClone(input));
      return ownership.start(prepared, () => start(prepared));
    },
    read: (run: string, sequence?: number) => readAgentRun(options.nodes, run, sequence),
    dispose: () => {
      disposed = true;
      ownership.dispose();
    },
  };
}
