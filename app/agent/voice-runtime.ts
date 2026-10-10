import { asSchema } from 'ai';
import { historyModelMessages } from './history.ts';
import type { ToolSet } from 'ai';
import type { NodeStore } from '../vault/nodes/store.ts';
import type { JsonValue } from '../vault/nodes/model.ts';
import { canonical, frozen } from '../vault/nodes/json.ts';
import { cancellable, serial } from '../vault/storage/coordination.ts';
import { createAgentBackend } from './runtime.ts';
import type { AgentRun, AgentRunState } from './runtime.ts';
import type { AgentExecutionInput, AgentExecutionResult } from './providers.ts';
import { prepareAgentRun } from './store.ts';
import type { PreparedAgentRun, SuppliedContext } from './store.ts';
import type { AgentToolFactory, AgentToolContext, ContentWritePolicy } from './tools.ts';
import { voiceInstructions } from './voice.ts';
import type { LiveVoiceEvents, LiveVoiceProvider, VoiceHistory, VoicePart } from './voice.ts';

export interface VoiceTurnPreparation {
  readonly provider: string;
  readonly model: string;
  readonly transcriptionModel: string;
  readonly item: string;
  readonly text: string;
  readonly timing: { readonly started: string; readonly ended: string };
  readonly instructions: string;
  readonly history: readonly VoiceHistory[];
  readonly context: readonly SuppliedContext[];
  readonly enabledTools: readonly { readonly name: string }[];
}
export interface VoiceAgentOptions {
  readonly nodes: NodeStore;
  readonly user: string;
  readonly agent: string;
  readonly instructions: string;
  readonly writableKinds?: readonly string[];
  readonly contentPolicy?: ContentWritePolicy;
  readonly tools: AgentToolFactory;
  readonly provider: string;
  readonly model: string;
  readonly transcriptionModel: string;
  readonly connect: LiveVoiceProvider<VoiceHistory, VoicePart>;
  readonly events: LiveVoiceEvents;
  readonly signal: AbortSignal;
  readonly history?: readonly VoiceHistory[];
  /** Caller may compose its own initial records, preserving the effective supplied context. */
  readonly prepareTurn?: (input: VoiceTurnPreparation) => Promise<PreparedAgentRun>;
  /** Caller owns transcript persistence; retain the exact prepared request under projection ID for retry. */
  readonly onResponse?: (
    item: string,
    parts: readonly VoicePart[],
    state: AgentRunState,
    status: 'running' | 'complete' | 'stopped' | 'failed',
    projection: string,
  ) => Promise<void>;
}
export interface VoiceAgentState {
  readonly phase: 'connecting' | 'listening' | 'responding' | 'closed' | 'paused' | 'unsaved';
  readonly run?: string;
  readonly execution?: AgentRunState;
  readonly parts?: readonly VoicePart[];
  readonly persistenceError?: string;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
async function describe(tools: ToolSet) {
  return canonical(
    await Promise.all(
      Object.entries(tools)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(async ([name, tool]) => {
          if (
            tool.type === 'provider' ||
            !tool.execute ||
            (tool.needsApproval !== undefined && tool.needsApproval !== false) ||
            typeof tool.description === 'function'
          )
            throw new Error(
              'Live voice requires local function tools with static descriptions and no approval requirement',
            );
          return {
            name,
            description: tool.description ?? name,
            schema: await asSchema(tool.inputSchema).jsonSchema,
          };
        }),
    ),
  );
}

/** Live media delegates each accepted run to the same Agent lifetime and durable tool wrapper. */
export async function createVoiceAgent(options: VoiceAgentOptions) {
  if (!options.instructions.trim()) throw new Error('Voice agent instructions are required');
  const lifetime = new AbortController();
  const signal = AbortSignal.any([options.signal, lifetime.signal]);
  const history = structuredClone(options.history ?? []) as VoiceHistory[];
  const instructions = voiceInstructions(options.instructions);
  const listeners = new Set<() => void>();
  let state: VoiceAgentState = frozen({ phase: 'connecting' });
  const notify = (next: VoiceAgentState) => {
    state = frozen(structuredClone(next));
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* Observers do not own execution. */
      }
    }
  };
  const declarationAbort = AbortSignal.abort();
  const declarationContext: AgentToolContext = {
    signal: declarationAbort,
    snapshot: () => {
      throw new Error('Tool declarations cannot read before an accepted turn');
    },
    commit: () =>
      Promise.reject(new Error('Tool declarations cannot write before an accepted turn')),
  };
  const declarations = await cancellable(
    Promise.resolve(options.tools(declarationContext)),
    signal,
  );
  const declared = await describe(declarations);
  const turns: {
    item: string;
    handle: AgentRun;
    prepared: PreparedAgentRun;
    input?: AgentExecutionInput;
    finish: ReturnType<typeof deferred<AgentExecutionResult>>;
    parts: readonly VoicePart[];
    dispose: () => void;
  }[] = [];
  let current: (typeof turns)[number] | undefined;
  const projections: {
    readonly id: string;
    readonly item: string;
    readonly parts: readonly VoicePart[];
    readonly execution: AgentRunState;
    readonly status: 'running' | 'complete' | 'stopped' | 'failed';
  }[] = [];
  const saveProjection = async (projection: (typeof projections)[number]) => {
    try {
      await options.onResponse?.(
        projection.item,
        projection.parts,
        projection.execution,
        projection.status,
        projection.id,
      );
    } catch (error) {
      notify({
        ...state,
        phase: 'unsaved',
        persistenceError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
  const order = serial();
  const expire = () => current?.handle.stop();
  let connection: Awaited<ReturnType<VoiceAgentOptions['connect']>> | undefined;
  let closing: Promise<void> | undefined;
  const close = () => {
    if (closing !== undefined) return closing;
    closing = Promise.resolve().then(async () => {
      await connection?.close();
      await order(async () => {
        for (const turn of turns) {
          turn.handle.stop();
          // biome-ignore lint/performance/noAwaitInLoops: drain each already accepted run.
          await turn.handle.done;
          turn.dispose();
        }
      });
      notify({
        ...state,
        phase: projections.length
          ? 'unsaved'
          : turns.some(({ handle }) => ['paused', 'unsaved'].includes(handle.snapshot().phase))
            ? 'paused'
            : 'closed',
      });
    });
    lifetime.abort();
    expire();
    return closing;
  };
  signal.addEventListener(
    'abort',
    () => {
      close().catch(() => undefined);
    },
    { once: true },
  );
  try {
    connection = await options.connect({
      instructions,
      events: options.events,
      signal,
      tools: declarations,
      history,
      expire,
      acceptUser: (item, text, timing) =>
        order(async () => {
          if (current) {
            const previous = current;
            current = undefined;
            previous.handle.stop();
            await previous.handle.done;
          }
          const messages = [
            ...historyModelMessages(history),
            { role: 'user' as const, content: text },
          ];
          const context: SuppliedContext[] = [
            {
              data: {
                kind: 'contextInput',
                role: 'system',
                position: 0,
                transformation: 'verbatim',
                content: instructions,
              },
            },
            ...messages.map(
              (message, index): SuppliedContext => ({
                data: {
                  kind: 'contextInput',
                  role: message.role,
                  position: index + 1,
                  transformation: typeof message.content === 'string' ? 'verbatim' : 'generated',
                  content:
                    typeof message.content === 'string'
                      ? message.content
                      : { message: JSON.parse(canonical(message)) },
                },
              }),
            ),
          ];
          const enabledTools = Object.keys(declarations).map((name) => ({ name }));
          const input: VoiceTurnPreparation = frozen({
            provider: options.provider,
            model: options.model,
            transcriptionModel: options.transcriptionModel,
            item,
            text,
            timing,
            instructions,
            history: structuredClone(history),
            context,
            enabledTools,
          });
          const prepared = options.prepareTurn
            ? await options.prepareTurn(input)
            : await prepareAgentRun(options.nodes, {
                id: crypto.randomUUID(),
                run: crypto.randomUUID(),
                agent: options.agent,
                recordedBy: options.user,
                at: timing.ended,
                provider: options.provider,
                model: options.model,
                settings: {},
                context,
                enabledTools,
              });
          const recordedContext = prepared.commit.changes
            .filter(
              ({ placement, data }) =>
                placement?.parent === prepared.run && data?.kind === 'contextInput',
            )
            .map(({ data }) => data);
          if (canonical(recordedContext) !== canonical(context.map(({ data }) => data)))
            throw new Error('Voice prepared context must retain effective session inputs');
          const ready = deferred<AgentExecutionInput>();
          const finish = deferred<AgentExecutionResult>();
          const backend = createAgentBackend({
            nodes: options.nodes,
            tools: async (owned) => {
              // Close drains finalized inputs without constructing new executable module contexts.
              if (signal.aborted) return declarations;
              const supplied = await options.tools(owned);
              if ((await describe(supplied)) !== declared)
                throw new Error('Voice tool declarations must remain stable for the live session');
              return supplied;
            },
            writableKinds: options.writableKinds,
            contentPolicy: options.contentPolicy,
            execution: async (executionInput) => {
              ready.resolve(executionInput);
              if (signal.aborted) return { status: 'stopped', text: '' };
              return await finish.promise;
            },
          });
          const handle = backend.start(prepared);
          const turn = {
            item,
            prepared,
            handle,
            finish,
            parts: [] as readonly VoicePart[],
            input: undefined as AgentExecutionInput | undefined,
            dispose: backend.dispose,
          };
          turns.push(turn);
          current = turn;
          handle.subscribe(() => {
            const execution = handle.snapshot();
            if (current === turn)
              notify({
                ...state,
                run: prepared.run,
                execution,
                phase:
                  execution.phase === 'paused' || execution.phase === 'unsaved'
                    ? execution.phase
                    : signal.aborted
                      ? 'closed'
                      : 'responding',
              });
          });
          history.push({ role: 'user', text });
          const accepted = await Promise.race([ready.promise, handle.done]);
          if ('phase' in accepted) {
            if (signal.aborted) return;
            throw new Error(
              accepted.persistenceError ??
                accepted.data.error?.message ??
                'Voice run cannot execute',
            );
          }
          turn.input = accepted;
          if (signal.aborted) {
            handle.stop();
            await handle.done;
            return;
          }
          notify({
            phase: 'responding',
            run: prepared.run,
            execution: handle.snapshot(),
            parts: [],
          });
        }),
      execute: async (call, callSignal): Promise<JsonValue> => {
        callSignal.throwIfAborted();
        const turn = current;
        if (!turn?.input) throw new Error('No accepted voice turn');
        turn.input.signal.throwIfAborted();
        const tool = turn.input.tools[call.name];
        if (!tool?.execute || tool.type === 'provider') throw new Error('Unknown voice tool');
        const schema = asSchema(tool.inputSchema);
        const validated = schema.validate ? await schema.validate(call.input) : undefined;
        if (!validated?.success) throw new Error('Invalid voice tool arguments');
        callSignal.throwIfAborted();
        turn.input.signal.throwIfAborted();
        const interrupted = () => turn.handle.stop();
        callSignal.addEventListener('abort', interrupted, { once: true });
        try {
          const output = await tool.execute(validated.value, {
            toolCallId: call.callId,
            messages: [...turn.input.messages],
            abortSignal: turn.input.signal,
            context: {},
          });
          return JSON.parse(canonical(output));
        } catch (error) {
          if (turn.input.signal.aborted && !callSignal.aborted) connection?.interrupt();
          throw error;
        } finally {
          callSignal.removeEventListener('abort', interrupted);
        }
      },
      recordResponse: (item, parts, status) =>
        order(async () => {
          const turn = turns.find((value) => value.item === item);
          if (!turn) return;
          turn.parts = frozen(structuredClone(parts));
          const text = parts
            .filter((part) => part.kind === 'text')
            .map((part) => part.text)
            .join('');
          turn.input?.progress(text, { parts: JSON.parse(canonical(parts)) });
          if (status !== 'running') {
            if (status === 'stopped') turn.handle.stop();
            turn.finish.resolve({ status, text, output: { parts: JSON.parse(canonical(parts)) } });
            await turn.handle.done;
            history.push({ role: 'agent', parts });
          }
          if (options.onResponse) {
            const projection = frozen({
              id: crypto.randomUUID(),
              item,
              parts: structuredClone(parts),
              execution: turn.handle.snapshot(),
              status,
            });
            projections.push(projection);
            await saveProjection(projection);
            projections.shift();
          }
          if (current === turn)
            notify({
              run: turn.prepared.run,
              parts,
              execution: turn.handle.snapshot(),
              phase:
                turn.handle.snapshot().phase === 'paused'
                  ? 'paused'
                  : turn.handle.snapshot().phase === 'unsaved'
                    ? 'unsaved'
                    : signal.aborted
                      ? 'closed'
                      : status === 'running'
                        ? 'responding'
                        : 'listening',
            });
        }),
    });
    signal.throwIfAborted();
    notify({ phase: 'listening' });
  } catch (error) {
    await close();
    throw error;
  }
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    mute: connection.mute,
    interrupt: connection.interrupt,
    close,
    retrySave: async () => {
      for (const turn of turns) {
        if (turn.handle.snapshot().phase !== 'paused' && turn.handle.snapshot().phase !== 'unsaved')
          continue;
        // biome-ignore lint/performance/noAwaitInLoops: each retained persistence obligation has stable identity.
        await turn.handle.retrySave();
      }
      while (projections.length) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: preserve caller projection ordering and retained identities.
          await saveProjection(projections[0]!);
          projections.shift();
        } catch {
          return state;
        }
      }
      const execution = current?.handle.snapshot();
      notify({
        ...state,
        execution,
        phase:
          execution && (execution.phase === 'paused' || execution.phase === 'unsaved')
            ? execution.phase
            : signal.aborted
              ? 'closed'
              : 'listening',
      });
      return state;
    },
  };
}
