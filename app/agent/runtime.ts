// Independent browser Agent lifetime. Callers own context assembly and presentation.
import { streamText } from 'ai';
import type { ModelMessage, SystemModelMessage } from 'ai';
import type { NodeCommit, NodeStore } from '../vault/nodes/store.ts';
import { canonical, frozen } from '../vault/nodes/json.ts';
import { cancellable } from '../vault/storage/coordination.ts';
import type { LanguageModelProvider } from './providers.ts';
import type { AgentRunData } from './records.ts';
import { parseAgentRun, parseContextInput, parseAgentSettings } from './schema.ts';
import { prepareAgentOutcome, readAgentRun, verifyAgentAcceptance } from './store.ts';
import type { PreparedAgentRun } from './store.ts';

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
    | 'recorded';
  readonly data: AgentRunData;
  readonly text: string;
  readonly persistenceError?: string;
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
}
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createAgentBackend(options: AgentBackendOptions) {
  const runs = new Map<string, { identity: string; handle: AgentRun }>();
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
          notify({ ...state, phase: 'unsaved', persistenceError: errorMessage(error) });
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
              notify({ phase: 'running', data, text });
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
        data = parseAgentRun({
          ...data,
          ended: new Date().toISOString(),
          timing: { elapsedMs: performance.now() - started },
          output: { text },
        });
        pending = prepareAgentOutcome(prepared, data);
        notify({ phase: 'saving', data, text });
        try {
          await options.nodes.commit(pending);
          pending = undefined;
          notify({ phase: data.status === 'running' ? 'recorded' : data.status, data, text });
        } catch (error) {
          notify({ phase: 'unsaved', data, text, persistenceError: errorMessage(error) });
        }
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
      stop: () => abort.abort(),
      retrySave: () => {
        if (retry !== undefined) return retry;
        retry = (async () => {
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
    start,
    read: (run: string, sequence?: number) => readAgentRun(options.nodes, run, sequence),
    dispose: () => {
      disposed = true;
      for (const { handle } of runs.values()) handle.stop();
    },
  };
}
