import { bindActor } from '@/modules/actors/index.ts';
import { executeEavRun } from '@/modules/agent/index.ts';
import type { AgentRunState } from '@/modules/agent/index.ts';
import { canonical, type DomainDatabase, SaveError, sameEntity } from '@/core/store/index.ts';
import type {
  ChatBackend,
  ChatBackendFactory,
  ChatOptions,
  ChatRequest,
  ChatRun,
  ChatRunState,
} from './backend.ts';
import { createCheckpointTask } from './checkpoint-task.ts';
import { submitChat } from './submission.ts';
import { projectedExchange } from './projection.ts';
import type { chatSchema } from './records.ts';
import { dialogueContext, timeline } from './context.ts';
import { historyCapability, historyTool } from './history-tool.ts';
import { agentActivity } from '@/modules/agent/index.ts';

type DB = DomainDatabase<typeof chatSchema>;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** One continuous dialogue. Retained history and model-context projection are separate reads. */
export function createEavChatBackend(
  options: ChatOptions & { readonly database: Promise<DB> },
): ChatBackend {
  let disposed = false;
  const runs = new Map<string, { request: string; handle: ChatRun; dispose: () => void }>();
  const database = () => options.database;
  const messages = async () => {
    const db = await database();
    return db.transaction(async (tx) => {
      const exchanges = await tx.entities.exchanges.query({
        limit: null, // Transcript restoration must not lose earlier Exchanges.
        select: {},
        orderBy: [{ position: 'asc' }],
      });
      return (await Promise.all(exchanges.map((exchange) => projectedExchange(tx, exchange))))
        .flat()
        .map((data) => ({ data }));
    });
  };
  const send = (input: ChatRequest): ChatRun => {
    if (disposed) throw new Error('Chat backend is disposed');
    const request = { ...input, text: input.text.trim() };
    if (!(request.id && request.text && request.model))
      throw new Error('Chat submission is incomplete');
    const requestKey = canonical(request);
    const previous = runs.get(request.id);
    if (previous) {
      if (previous.request !== requestKey) throw new Error('Request identity was reused');
      return previous.handle;
    }
    const listeners = new Set<() => void>();
    let stopped = false;
    let prepared = false;
    let saving = false;
    let savingContent = false;
    let refreshing = false;
    let execution: ReturnType<typeof executeEavRun> | undefined;
    let submitted: Awaited<ReturnType<typeof submitChat>> | undefined;
    let pending: { stage: 'initial' | 'response'; retry: () => Promise<unknown> } | undefined;
    let state: ChatRunState = {
      phase: 'queued',
      response: {
        kind: 'message',
        role: 'agent',
        at: new Date().toISOString(),
        status: 'running',
        parts: [],
        model: request.model,
      },
    };
    const notify = (patch: Partial<ChatRunState>) => {
      if (disposed) return;
      state = { ...state, ...patch };
      state = {
        ...state,
        recovery: {
          ...(state.persistenceError &&
            state.persistenceStage && {
              save: {
                stage: state.persistenceStage,
                error: state.persistenceError,
                label: 'Chat activity needs saving',
                allowed: !saving,
                inProgress: saving,
              },
            }),
          ...(state.contentPersistence && {
            content: {
              error: state.contentPersistence.error,
              label: 'Content publication needs recovery',
              allowed: !savingContent,
              inProgress: savingContent,
            },
          }),
          ...(state.contextError && {
            refresh: {
              error: state.contextError,
              label: 'Records need refreshing',
              allowed: !refreshing,
              inProgress: refreshing,
            },
          }),
        },
      };
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          /* Observers cannot reject accepted work. */
        }
      }
    };
    const reflect = () => {
      if (!execution) return;
      const current = execution.snapshot();
      const parts = agentActivity(current);
      notify({
        phase: current.phase,
        execution: current,
        response: {
          ...state.response,
          status: current.data.status,
          parts,
          ...(current.data.error && { error: current.data.error.message }),
          ...(current.data.usage && {
            tokens: { in: current.data.usage.input, out: current.data.usage.output },
          }),
        },
        persistenceError: current.persistenceError,
        persistenceStage: current.persistenceStage,
        contentPersistence: current.contentPersistence,
        contentAccepted: current.contentAccepted,
        contextError: current.contextError,
      });
    };
    const restore = async (db: DB) => {
      const accepted = await db.entities.exchanges.first({
        where: { submission: { eq: request.id } },
        select: { run: { requestedModel: true } },
      });
      if (!accepted) return false;
      const userMessage = await db.entities.messages.first({
        where: { exchange: { eq: accepted } },
        select: { author: true, text: true },
      });
      const authorBinding = await db.entities.actorBindings.first({
        where: { key: { eq: options.user } },
        select: { actor: true },
      });
      if (
        !(
          authorBinding &&
          userMessage?.author &&
          sameEntity(authorBinding.actor, userMessage?.author)
        ) ||
        userMessage?.text !== request.text ||
        accepted.run?.requestedModel !== request.model
      )
        throw new Error('Request identity was reused');
      const response = (await db.transaction((tx) => projectedExchange(tx, accepted))).find(
        (message) => message.role === 'agent',
      );
      if (response?.role !== 'agent') throw new Error('Saved response is unavailable');
      prepared = true;
      const data: AgentRunState = {
        phase: 'recorded',
        data: {
          kind: 'agentRun',
          status: response.status,
          started: response.at,
          provider: options.provider,
          model: { requested: request.model },
          settings: {},
          enabledTools: [],
        },
        text: '',
      };
      notify({
        phase: response.status === 'running' ? 'recorded' : response.status,
        response,
        execution: data,
        persistenceError: undefined,
        persistenceStage: undefined,
      });
      return true;
    };
    const done = (async () => {
      try {
        const db = await database();
        if (await restore(db)) return state;
        if (disposed || stopped) return state;
        const startedAt = new Date();
        const prepare = async () => {
          await db.refresh();
          if (await restore(db)) return;
          const author = await db.transaction((tx) =>
            bindActor(tx, options.user, 'user', options.user),
          );
          return db.transaction({ author }, async (tx) => {
            if (disposed || stopped) throw new Error('Chat stopped before acceptance');
            const user = author;
            const actor = await bindActor(tx, options.agent, 'agent', options.agent);
            const tools = [];
            for (const tool of [...(options.enabledTools ?? []), historyCapability]) {
              const version = tool.version ?? 'unversioned';
              let definition = await tx.entities.toolDefinitions.first({
                where: { name: { eq: tool.name }, version: { eq: version } },
                select: { name: true, version: true },
              });
              definition ??= await tx.entities.toolDefinitions.insert({ name: tool.name, version });
              tools.push(definition);
            }
            let agent = await tx.entities.agents.first({
              where: { actor: { eq: actor } },
              select: {},
            });
            const config = {
              actor,
              provider: options.provider,
              model: request.model,
              instructions: options.instructions,
              settings: options.settings ?? {},
              tools,
            };
            if (agent) await tx.entities.agents.update({ ...agent, ...config });
            else agent = await tx.entities.agents.insert(config);
            const context = await dialogueContext(tx);
            submitted = await submitChat(tx, {
              submission: request.id,
              author: user,
              agent,
              text: request.text,
              at: startedAt,
              context: context.inputs,
            });
            await tx.entities.runContexts.insert({
              run: submitted.run,
              ...(context.checkpoint && { checkpoint: context.checkpoint }),
              exchanges: context.exchanges,
            });
            prepared = true;
          });
        };
        try {
          await prepare();
        } catch (error) {
          let failure = error;
          pending = {
            stage: 'initial',
            retry: async () => {
              try {
                if (failure instanceof SaveError) {
                  await failure.retry();
                  if (!submitted) await prepare();
                } else await prepare();
              } catch (next) {
                failure = next;
                throw next;
              }
            },
          };
          notify({
            phase: 'unsaved',
            persistenceStage: 'initial',
            persistenceError: message(error),
          });
          return state;
        }
        if (!submitted) return state;
        if (disposed || stopped) {
          await restore(db);
          return state;
        }
        execution = executeEavRun({
          ...options,
          db,
          run: submitted!.run,
          tools: async (context) => ({
            ...(await options.tools?.(context)),
            [historyCapability.name]: historyTool(db),
          }),
        });
        execution.subscribe(reflect);
        reflect();
        await execution.done;
        reflect();
      } catch (error) {
        notify({
          phase: 'failed',
          response: { ...state.response, status: 'failed', error: message(error) },
        });
      }
      return state;
    })();
    let retry: Promise<ChatRunState> | undefined;
    const handle: ChatRun = {
      snapshot: () => state,
      done,
      prepared: () => prepared || undefined,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      stop: () => {
        stopped = true;
        execution?.stop();
      },
      retrySave: () => {
        if (retry) return retry;
        saving = true;
        retry = Promise.resolve()
          .then(async () => {
            if (disposed) return state;
            if (pending) {
              try {
                await pending.retry();
                pending = undefined;
                await restore(await options.database);
              } catch (error) {
                notify({ persistenceError: message(error) });
              }
            } else {
              await execution?.retrySave();
              reflect();
            }
            return state;
          })
          .finally(() => {
            retry = undefined;
            saving = false;
            notify({});
          })
          .then(() => state);
        notify({});
        return retry;
      },
      retryContentSave: async () => {
        savingContent = true;
        notify({});
        try {
          await execution?.retryContentSave();
        } finally {
          savingContent = false;
          reflect();
          notify({});
        }
        return state;
      },
      refreshContext: async () => {
        refreshing = true;
        notify({});
        try {
          await (await options.database).refresh();
          await execution?.refreshContext();
        } finally {
          refreshing = false;
          reflect();
          notify({});
        }
        return state;
      },
    };
    runs.set(request.id, {
      request: requestKey,
      handle,
      dispose: () => {
        stopped = true;
        execution?.dispose();
        listeners.clear();
      },
    });
    return handle;
  };
  return {
    send,
    messages,
    timeline: () => database().then((db) => db.transaction(timeline)),
    checkpoint: (model) =>
      createCheckpointTask({ ...options, database: database(), modelName: model }),
    subscribe: (listener) => {
      let close: (() => void) | undefined;
      let active = true;
      void options.database
        .then((db) => {
          if (active) close = db.subscribe(listener);
        })
        .catch(() => undefined);
      return () => {
        active = false;
        close?.();
      };
    },
    dispose: () => {
      disposed = true;
      for (const run of runs.values()) run.dispose();
    },
  };
}

/** Bind a Vault database once; interaction options can change within its session. */
export function eavChatFactory(database: Promise<DB>): ChatBackendFactory {
  return (options) => createEavChatBackend({ ...options, database });
}
