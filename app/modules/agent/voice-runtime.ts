import type { ToolSet } from 'ai';
import { asSchema } from 'ai';
import type { EntityRef } from '@/core/store/index.ts';
import { type Database, SaveError, type Transaction } from '@/core/store/index.ts';
import type { Actor } from '@/modules/actors/index.ts';
import { historyModelMessages } from './history.ts';

import { cancellable, serial } from '@/shared/async/async.ts';
import type { JsonValue } from '@/core/store/index.ts';
import { canonical, frozen } from '@/core/store/index.ts';
import type { RunInput } from './operations.ts';
import { finishAgentRun, readAgentRun, startAgentRun } from './operations.ts';
import type { AgentRef, AgentRunRef, agentSchema } from './records.ts';
import { executeEavRun } from './execution/runtime.ts';
import type { AgentExecutionInput, AgentExecutionResult } from './providers.ts';
import type { AgentRun, AgentRunState } from './runtime.ts';
import type { AgentToolContext, AgentToolFactory } from './tools.ts';
import type { LiveVoiceEvents, LiveVoiceProvider, VoiceHistory, VoicePart } from './voice.ts';
import { voiceInstructions } from './voice.ts';

type ActorRef = EntityRef<typeof Actor>;

export interface VoiceTurnPreparation {
  readonly provider: string;
  readonly model: string;
  readonly transcriptionModel: string;
  readonly item: string;
  readonly text: string;
  readonly timing: { readonly started: string; readonly ended: string };
  readonly instructions: string;
  readonly history: readonly VoiceHistory[];
  readonly context: readonly RunInput[];
  readonly enabledTools: readonly { readonly name: string }[];
}
export interface VoiceAgentOptions {
  readonly db: Pick<Database<typeof agentSchema>, 'entities' | 'transaction' | 'refresh'>;
  readonly user: ActorRef;
  readonly agent: AgentRef;
  /** Planned caller context; it may be created by the initial turn calculation. */
  readonly origin?: ActorRef | AgentRunRef;
  readonly instructions: string;
  readonly tools: AgentToolFactory;
  readonly provider: string;
  readonly model: string;
  readonly transcriptionModel: string;
  readonly connect: LiveVoiceProvider<VoiceHistory, VoicePart>;
  readonly events: LiveVoiceEvents;
  readonly signal: AbortSignal;
  readonly history?: readonly VoiceHistory[];
  /** Caller may compose its own initial records, preserving the effective supplied context. */
  readonly prepareTurn?: (
    input: VoiceTurnPreparation,
    tx: Transaction<typeof agentSchema>,
  ) => Promise<{ readonly run: AgentRunRef }>;
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
  readonly run?: AgentRunRef;
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
            schema: JSON.parse(JSON.stringify(await asSchema(tool.inputSchema).jsonSchema)),
          };
        }),
    ),
  );
}

/** Live media delegates each accepted run to the same Agent lifetime and durable tool wrapper. */
export async function createVoiceAgent(options: VoiceAgentOptions) {
  if (!options.instructions.trim()) throw new Error('Voice agent instructions are required');
  const lifetime = new AbortController();
  const recording = new AbortController();
  const signal = AbortSignal.any([options.signal, lifetime.signal]);
  const history = structuredClone(options.history ?? []) as VoiceHistory[];
  const instructions = voiceInstructions(options.instructions);
  const listeners = new Set<() => void>();
  let state: VoiceAgentState = frozen({ phase: 'connecting' });
  const notify = (next: VoiceAgentState) => {
    state = frozen({ ...next });
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* Observers do not own execution. */
      }
    }
  };
  const declarationAbort = AbortSignal.abort();
  const declarationContext: AgentToolContext = { signal: declarationAbort };
  const declarations = await cancellable(
    Promise.resolve(options.tools(declarationContext)),
    signal,
  );
  const declared = await describe(declarations);
  const turns: {
    item: string;
    handle: AgentRun;
    prepared: { readonly run: AgentRunRef };
    input?: AgentExecutionInput;
    finish: ReturnType<typeof deferred<AgentExecutionResult>>;
    parts: readonly VoicePart[];
    dispose: () => void;
  }[] = [];
  let current: (typeof turns)[number] | undefined;
  const admissions: { error?: SaveError; run: AgentRunRef; author: ActorRef; endedAt: Date }[] = [];
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
  const needsRecovery = (turn: (typeof turns)[number]) => {
    const execution = turn.handle.snapshot();
    return (
      ['paused', 'unsaved'].includes(execution.phase) ||
      !!(execution.contentPersistence || execution.contextError) ||
      Object.values(execution.recoveryActivity ?? {}).some(Boolean)
    );
  };
  const releaseRecovered = (turn: (typeof turns)[number]) => {
    if (!needsRecovery(turn)) turn.dispose();
  };
  const reflectRecovery = () => {
    const execution = current?.handle.snapshot();
    const phase =
      projections.length || admissions.length
        ? 'unsaved'
        : execution?.phase === 'paused' || execution?.phase === 'unsaved'
          ? execution.phase
          : signal.aborted
            ? turns.some(needsRecovery)
              ? 'paused'
              : 'closed'
            : execution && ['accepting', 'running', 'saving'].includes(execution.phase)
              ? 'responding'
              : 'listening';
    notify({ ...state, execution, phase });
    return state;
  };
  let connection: Awaited<ReturnType<VoiceAgentOptions['connect']>> | undefined;
  let closing: Promise<void> | undefined;
  const close = () => {
    if (closing !== undefined) return closing;
    closing = Promise.resolve()
      .then(async () => {
        await connection?.close();
        await order(async () => {
          for (const turn of turns) {
            turn.handle.stop();
            // biome-ignore lint/performance/noAwaitInLoops: drain each already accepted run.
            await turn.handle.done;
            // Closing the protocol retains the stopped Agent owner until its pending saves recover.
            releaseRecovered(turn);
          }
        });
        notify({
          ...state,
          phase:
            projections.length || admissions.length
              ? 'unsaved'
              : turns.some(needsRecovery)
                ? 'paused'
                : 'closed',
        });
      })
      .finally(() => recording.abort());
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
          const context: RunInput[] = [
            { role: 'system', transformation: 'generated', content: instructions },
            ...messages.map(
              (message): RunInput => ({
                role: message.role,
                transformation: typeof message.content === 'string' ? 'verbatim' : 'generated',
                content:
                  typeof message.content === 'string'
                    ? message.content
                    : { message: JSON.parse(canonical(message)) },
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
          // Finalized protocol input drains after execution closes; caller preparation expires now.
          const preparationSignal = options.prepareTurn ? signal : recording.signal;
          preparationSignal.throwIfAborted();
          let acceptedRun: AgentRunRef | undefined;
          let acceptedAuthor: ActorRef | undefined;
          let prepared: { readonly run: AgentRunRef };
          try {
            prepared = await options.db.transaction(
              { author: options.user, ...(options.origin && { origin: options.origin }) },
              async (tx) => {
                preparationSignal.throwIfAborted();
                const accepted = options.prepareTurn
                  ? await cancellable(options.prepareTurn(input, tx), preparationSignal)
                  : await startAgentRun(tx, {
                      agent: options.agent,
                      startedAt: new Date(timing.ended),
                      instructions,
                      inputs: context.slice(1),
                    });
                preparationSignal.throwIfAborted();
                const recorded = await readAgentRun(tx, accepted.run);
                if (
                  !recorded ||
                  recorded.provider !== options.provider ||
                  recorded.requestedModel !== options.model
                )
                  throw new Error('Voice prepared run must retain the session provider and model');
                if (
                  canonical(
                    recorded.inputs.map(({ role, transformation, content }) => ({
                      role,
                      transformation,
                      content,
                    })),
                  ) !== canonical(context)
                )
                  throw new Error('Voice prepared context must retain effective session inputs');
                if (
                  canonical(
                    recorded.tools
                      .map(({ name }) => ({ name }))
                      .sort((a, b) => a.name.localeCompare(b.name)),
                  ) !== canonical([...enabledTools].sort((a, b) => a.name.localeCompare(b.name)))
                )
                  throw new Error('Voice prepared tools must retain session capabilities');
                acceptedRun = accepted.run;
                acceptedAuthor = recorded.author;
                return accepted;
              },
            );
          } catch (error) {
            if (error instanceof SaveError && acceptedRun && acceptedAuthor) {
              admissions.push({
                error,
                run: acceptedRun,
                author: acceptedAuthor,
                endedAt: new Date(),
              });
              notify({
                ...state,
                phase: 'unsaved',
                run: acceptedRun,
                persistenceError: error.message,
              });
            }
            throw error;
          }
          const ready = deferred<AgentExecutionInput>();
          const finish = deferred<AgentExecutionResult>();
          const handle = executeEavRun({
            db: options.db,
            run: prepared.run,
            tools: async (owned) => {
              // Close drains finalized inputs without constructing new executable module contexts.
              if (signal.aborted) return declarations;
              const supplied = await options.tools(owned);
              if ((await describe(supplied)) !== declared)
                throw new Error('Voice tool declarations must remain stable for the live session');
              return supplied;
            },
            execution: async (executionInput) => {
              ready.resolve(executionInput);
              if (signal.aborted) return { status: 'stopped', text: '' };
              return await finish.promise;
            },
          });
          const turn = {
            item,
            prepared,
            handle,
            finish,
            parts: [] as readonly VoicePart[],
            input: undefined as AgentExecutionInput | undefined,
            dispose: handle.dispose,
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
    retryContentSave: async () => {
      for (const turn of turns) {
        if (!turn.handle.snapshot().contentPersistence) continue;
        // biome-ignore lint/performance/noAwaitInLoops: each Agent owns its immutable content obligation.
        await turn.handle.retryContentSave();
        if (signal.aborted) releaseRecovered(turn);
      }
      return reflectRecovery();
    },
    refreshContext: async () => {
      for (const turn of turns) {
        if (!turn.handle.snapshot().contextError) continue;
        // biome-ignore lint/performance/noAwaitInLoops: refresh each retained Agent reading obligation.
        await turn.handle.refreshContext();
        if (signal.aborted) releaseRecovered(turn);
      }
      return reflectRecovery();
    },
    retrySave: async () => {
      while (admissions.length) {
        const admission = admissions[0]!;
        try {
          if (admission.error) {
            // biome-ignore lint/performance/noAwaitInLoops: Recover admissions in accepted order.
            await admission.error.retry();
            admission.error = undefined;
          }
          await options.db.transaction(
            { author: admission.author, origin: admission.run },
            async (tx) => {
              const run = await readAgentRun(tx, admission.run);
              if (run?.status === 'running')
                await finishAgentRun(tx, admission.run, {
                  status: 'interrupted',
                  endedAt: admission.endedAt,
                  finishReason: 'admissionNotExecuted',
                });
            },
          );
          admissions.shift();
        } catch (error) {
          if (error instanceof SaveError) admission.error = error;
          notify({
            ...state,
            phase: 'unsaved',
            persistenceError: error instanceof Error ? error.message : String(error),
          });
          return state;
        }
      }
      for (const turn of turns) {
        if (turn.handle.snapshot().phase !== 'paused' && turn.handle.snapshot().phase !== 'unsaved')
          continue;
        // biome-ignore lint/performance/noAwaitInLoops: each retained persistence obligation has stable identity.
        await turn.handle.retrySave();
        if (signal.aborted) releaseRecovered(turn);
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
      return reflectRecovery();
    },
  };
}
