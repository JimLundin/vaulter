import { publishChatEvidence } from './eav-bridge.ts';
import {
  SaveError,
  sameEntity,
  type Database,
  type ReadView,
  type Transaction,
} from '../../vault/eav/index.ts';
import { canonical } from '../../vault/nodes/json.ts';
import { nodeOperations } from '../../vault/nodes/operations.ts';
import type { TransactionRequest } from '../../vault/transactions/store.ts';
import { executeEavRun } from '../../agent/eav/runtime.ts';
import { readAgentRun } from '../../agent/data/operations.ts';
import type { AgentRunState } from '../../agent/runtime.ts';
import type { chatSchema, MessageRef } from './data/schema.ts';
import { createConversation, submitChat, recordResponse, readMessage } from './data/operations.ts';
import { savedChats, savedMessages, type SavedChat } from './records/chat-store.ts';
import { historyModelMessages } from '../../agent/history.ts';
import type { MessageData, MessagePart } from './records/chat.ts';
import type { NodeChatOptions, NodeChatRequest, NodeChatRunState } from './node-backend.ts';
import type { ChatBackend, ChatRun } from './backend.ts';

type DB = Database<typeof chatSchema>;
async function boundActor(tx: Transaction<typeof chatSchema>, key: string, kind: 'user' | 'agent') {
  const binding = await tx.entities.actorBindings.first({
    where: { key: { eq: key } },
    select: { actor: { name: true, kind: true } },
  });
  if (binding) {
    if (binding.actor.kind !== kind) throw new Error('Configured actor has an incompatible role');
    return binding.actor;
  }
  const actor = await tx.entities.actors.insert({ name: key, kind });
  await tx.entities.actorBindings.insert({ key, actor });
  return actor;
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const jsonError = (value: unknown) =>
  value && typeof value === 'object' && 'message' in value ? String(value.message) : undefined;

async function projectedMessage(
  tx: ReadView<typeof chatSchema>,
  identity: MessageRef,
): Promise<MessageData> {
  const value = await readMessage(tx, identity);
  if (!value) throw new Error('Chat message is unavailable');
  const at = value.at.toISOString();
  const text = value.parts.flatMap((part) => (part.kind === 'text' ? [part.text] : [])).join('');
  if (value.role === 'user') return { kind: 'message', role: 'user', at, text };
  if (value.role === 'record')
    return {
      kind: 'message',
      role: 'record',
      at,
      text,
      record: { kind: 'summary', ...(value.label && { label: value.label }) },
    };
  const parts: MessagePart[] = value.parts.map((part) =>
    part.kind === 'text'
      ? { kind: 'text', text: part.text }
      : {
          kind: 'tool',
          callId: part.execution.call,
          name: part.execution.tool.name,
          version: part.execution.tool.version,
          input: part.execution.input,
          status: part.execution.status,
          ...(part.execution.output !== undefined && { output: part.execution.output }),
          ...(part.execution.error !== undefined && { error: jsonError(part.execution.error) }),
        },
  );
  const run = value.run ? await readAgentRun(tx, value.run) : undefined;
  if (!parts.length && run) {
    for (const execution of run.executions)
      parts.push({
        kind: 'tool',
        callId: execution.call,
        name: execution.tool.name,
        version: execution.tool.version,
        input: execution.input,
        status: execution.status,
        ...(execution.output !== undefined && { output: execution.output }),
        ...(execution.error !== undefined && { error: jsonError(execution.error) }),
      });
    if (
      run.output &&
      typeof run.output === 'object' &&
      'text' in run.output &&
      typeof run.output.text === 'string'
    )
      parts.push({ kind: 'text', text: run.output.text });
  }
  return {
    kind: 'message',
    role: 'agent',
    at,
    status: value.status,
    parts,
    ...(run && { model: run.servedModel ?? run.requestedModel }),
    ...(run?.inputTokens !== undefined &&
      run.outputTokens !== undefined && {
        tokens: { in: run.inputTokens, out: run.outputTokens },
      }),
    ...(value.error !== undefined && { error: jsonError(value.error) }),
  };
}

/** Live Chat writes EAV; old conversations remain readable while other modules migrate. */
export function createEavChatBackend(
  options: NodeChatOptions & { readonly database: Promise<DB> },
): ChatBackend {
  let disposed = false;
  const runs = new Map<string, { request: string; handle: ChatRun; dispose: () => void }>();
  const messages = async (conversation: string, allowNew = false) => {
    const db = await options.database;
    const legacy = await options.nodes.snapshot();
    const exists = legacy.get(conversation)?.data?.kind === 'conversation';
    const old = exists ? await savedMessages(options.nodes, conversation, legacy.sequence) : [];
    return db.transaction(async (tx) => {
      const route = await tx.entities.conversationRoutes.first({
        where: { value: { eq: conversation } },
        select: { conversation: true },
      });
      if (!route) {
        if (!(exists || allowNew))
          throw new Error(
            'Conversation is unavailable. Start a new chat or choose another conversation.',
          );
        return old;
      }
      const entities = await tx.entities.messages.query({
        where: { exchange: { matches: { conversation: { eq: route.conversation } } } },
        select: { exchange: { position: true }, position: true },
      });
      entities.sort((a, b) => a.exchange.position - b.exchange.position || a.position - b.position);
      return [
        ...old,
        ...(await Promise.all(
          entities.map(async (entity) => ({ data: await projectedMessage(tx, entity) })),
        )),
      ];
    });
  };
  const send = (input: NodeChatRequest): ChatRun => {
    if (disposed) throw new Error('Chat backend is disposed');
    const request = { ...input, text: input.text.trim() };
    if (!(request.id && request.conversation && request.text && request.model))
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
    let execution: ReturnType<typeof executeEavRun> | undefined;
    let submitted: Awaited<ReturnType<typeof submitChat>> | undefined;
    let pending: { stage: 'initial' | 'response'; retry: () => Promise<unknown> } | undefined;
    let state: NodeChatRunState = {
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
    const notify = (patch: Partial<NodeChatRunState>) => {
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
                allowed: true,
                inProgress: false,
              },
            }),
          ...(state.contentPersistence && {
            content: {
              error: state.contentPersistence.error,
              label: 'Content publication needs recovery',
              allowed: true,
              inProgress: false,
            },
          }),
          ...(state.contextError && {
            refresh: {
              error: state.contextError,
              label: 'Records need refreshing',
              allowed: true,
              inProgress: false,
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
      const receipts = [...(current.tools ?? [])];
      if (current.pendingTool?.stage === 'outcome') {
        const index = receipts.findIndex((tool) => tool.node === current.pendingTool!.node);
        if (index >= 0)
          receipts[index] = { node: current.pendingTool.node, data: current.pendingTool.execution };
        else receipts.push({ node: current.pendingTool.node, data: current.pendingTool.execution });
      }
      const parts: MessagePart[] = receipts.map(({ data }) => ({
        kind: 'tool',
        callId: data.call,
        name: data.name,
        version: data.version,
        input: data.input,
        status: data.status,
        ...(data.output !== undefined && { output: data.output }),
        ...(data.error && { error: data.error.message }),
      }));
      if (current.text) parts.push({ kind: 'text', text: current.text });
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
      const accepted = await db.entities.submissions.first({
        where: { key: { eq: request.id } },
        select: {
          route: { value: true },
          userMessage: { author: { name: true } },
          response: true,
          run: { requestedModel: true },
        },
      });
      if (!accepted) return false;
      const text = await db.entities.textParts.first({
        where: { message: { eq: accepted.userMessage } },
        select: { text: true },
      });
      const authorBinding = await db.entities.actorBindings.first({
        where: { key: { eq: options.user } },
        select: { actor: true },
      });
      if (
        !(
          authorBinding &&
          accepted.userMessage.author &&
          sameEntity(authorBinding.actor, accepted.userMessage.author)
        ) ||
        accepted.route.value !== request.conversation ||
        text?.text !== request.text ||
        accepted.run.requestedModel !== request.model
      )
        throw new Error('Request identity was reused');
      const response = await db.transaction((tx) => projectedMessage(tx, accepted.response));
      if (response.role !== 'agent') throw new Error('Saved response is unavailable');
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
    const saveEvidence = async (role: 'user' | 'agent', text: string) => {
      let publication: TransactionRequest<unknown> | undefined;
      const author = role === 'user' ? options.user : options.agent;
      try {
        await publishChatEvidence({
          nodes: options.nodes,
          submission: request.id,
          conversation: request.conversation,
          role,
          text,
          at: submitted?.userMessage.at.toISOString() ?? state.response.at,
          author,
          origin: `eav-run:${request.id}`,
          pending: (value) => {
            publication = value;
          },
        });
      } catch (error) {
        if (publication) {
          const retained = publication;
          pending = {
            stage: role === 'user' ? 'initial' : 'response',
            retry: async () => {
              using writes = options.nodes
                .writer({ recordedBy: author, origin: `eav-run:${request.id}` })
                .lifetime();
              await writes.retry(retained);
            },
          };
        }
        throw error;
      }
    };
    const saveResponse = async () => {
      if (disposed || !execution || !submitted || pending) return;
      const current = execution.snapshot();
      if (
        current.data.status === 'running' ||
        current.persistenceError ||
        current.phase === 'paused'
      )
        return;
      const db = await options.database;
      const parts = [
        ...execution.receipts().map((entity) => ({ kind: 'tool' as const, execution: entity })),
        ...(current.text ? [{ kind: 'text' as const, text: current.text }] : []),
      ];
      try {
        await db.transaction({ author: submitted.run.author, origin: submitted.exchange }, (tx) =>
          recordResponse(tx, submitted!.response, parts),
        );
      } catch (error) {
        let failure = error;
        pending = {
          stage: 'response',
          retry: async () => {
            try {
              if (failure instanceof SaveError) await failure.retry();
              else
                await db.transaction(
                  { author: submitted!.run.author, origin: submitted!.exchange },
                  (tx) => recordResponse(tx, submitted!.response, parts),
                );
            } catch (next) {
              failure = next;
              throw next;
            }
            await saveEvidence('agent', current.text);
          },
        };
        notify({
          phase: 'unsaved',
          persistenceStage: 'response',
          persistenceError: message(error),
        });
        return;
      }
      try {
        await saveEvidence('agent', current.text);
      } catch (error) {
        notify({
          phase: 'unsaved',
          persistenceStage: 'response',
          persistenceError: message(error),
        });
      }
    };
    const done = (async () => {
      try {
        const db = await options.database;
        if (await restore(db)) return state;
        if (disposed || stopped) return state;
        const history = await messages(request.conversation, true);
        const context = history.flatMap(({ data }) =>
          data.role === 'record'
            ? [{ role: 'user' as const, content: `Retained summary source material: ${data.text}` }]
            : historyModelMessages([data]),
        );
        const legacyConversation = (await options.nodes.snapshot()).get(request.conversation);
        const legacyTitle =
          legacyConversation?.data?.kind === 'conversation'
            ? legacyConversation.data.title
            : undefined;
        const startedAt = new Date();
        const prepare = async () => {
          await db.refresh();
          if (await restore(db)) return;
          const author = await db.transaction((tx) => boundActor(tx, options.user, 'user'));
          return db.transaction({ author }, async (tx) => {
            if (disposed || stopped) throw new Error('Chat stopped before acceptance');
            const user = author;
            const actor = await boundActor(tx, options.agent, 'agent');
            const tools = [];
            for (const tool of options.enabledTools ?? []) {
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
            let route = await tx.entities.conversationRoutes.first({
              where: { value: { eq: request.conversation } },
              select: { conversation: true },
            });
            if (!route) {
              const conversation = await createConversation(tx, {
                title:
                  typeof legacyTitle === 'string' && legacyTitle
                    ? legacyTitle
                    : request.text.slice(0, 100),
                createdAt: startedAt,
              });
              route = await tx.entities.conversationRoutes.insert({
                value: request.conversation,
                conversation,
              });
            }
            submitted = await submitChat(tx, {
              conversation: route.conversation,
              author: user,
              agent,
              text: request.text,
              at: startedAt,
              context: context.map((effective) => ({
                role: effective.role,
                transformation: 'generated',
                content: JSON.parse(canonical({ message: effective })),
              })),
            });
            await tx.entities.submissions.insert({
              key: request.id,
              route,
              userMessage: submitted.userMessage,
              response: submitted.response,
              run: submitted.run,
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
        // A small retained backlink lets unmigrated modules attribute content to this EAV run.
        const origin = `eav-run:${request.id}`;
        let bridge: TransactionRequest<unknown> | undefined;
        try {
          if (!(await options.nodes.snapshot()).get(origin)) {
            using writes = options.nodes
              .writer({ recordedBy: options.agent, origin: null })
              .lifetime();
            bridge = writes.write(() => ({
              value: undefined,
              transaction: {
                kind: nodeOperations.create,
                message: null,
                undoOf: null,
                changes: [
                  {
                    node: origin,
                    expected: null,
                    data: {
                      kind: 'externalRecord',
                      system: 'eav',
                      type: 'agent.run',
                      submission: request.id,
                      conversation: request.conversation,
                    },
                    placement: null,
                    connection: null,
                  },
                ],
              },
            }));
            await bridge.result;
          }
        } catch (error) {
          if (bridge) {
            const request = bridge;
            pending = {
              stage: 'initial',
              retry: async () => {
                using writes = options.nodes
                  .writer({ recordedBy: options.agent, origin: null })
                  .lifetime();
                await writes.retry(request);
              },
            };
          }
          notify({
            phase: 'unsaved',
            persistenceStage: 'initial',
            persistenceError: message(error),
          });
          return state;
        }
        if (disposed || stopped) {
          await restore(db);
          return state;
        }
        try {
          await saveEvidence('user', request.text);
        } catch (error) {
          notify({
            phase: 'unsaved',
            persistenceStage: 'initial',
            persistenceError: message(error),
          });
          return state;
        }
        if (disposed || stopped) {
          await restore(db);
          return state;
        }
        execution = executeEavRun({ ...options, db, run: submitted!.run, origin });
        execution.subscribe(reflect);
        reflect();
        await execution.done;
        reflect();
        await saveResponse();
      } catch (error) {
        notify({
          phase: 'failed',
          response: { ...state.response, status: 'failed', error: message(error) },
        });
      }
      return state;
    })();
    let retry: Promise<NodeChatRunState> | undefined;
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
        retry ??= (async () => {
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
            await saveResponse();
          }
          return state;
        })().finally(() => {
          retry = undefined;
        });
        return retry;
      },
      retryContentSave: async () => {
        await execution?.retryContentSave();
        reflect();
        return state;
      },
      refreshContext: async () => {
        await (await options.database).refresh();
        await execution?.refreshContext();
        reflect();
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
    chats: async (query = {}) => {
      const db = await options.database;
      const old = await savedChats(options.nodes, { limit: Number.MAX_SAFE_INTEGER });
      const routes = await db.entities.conversationRoutes.query({
        select: { value: true, conversation: { title: true, createdAt: true } },
      });
      const chats = new Map(old.map((chat) => [chat.node, chat]));
      for (const route of routes) {
        const latest = await db.entities.exchanges.first({
          where: { conversation: { eq: route.conversation } },
          select: { startedAt: true },
          orderBy: [{ startedAt: 'desc' }],
        });
        const value: SavedChat = {
          node: route.value,
          data: {
            kind: 'conversation',
            title: route.conversation.title,
            createdAt: route.conversation.createdAt.toISOString(),
          },
          activeAt: (latest?.startedAt ?? route.conversation.createdAt).toISOString(),
        };
        chats.set(route.value, value);
      }
      return [...chats.values()]
        .sort((a, b) => b.activeAt.localeCompare(a.activeAt))
        .slice(0, query.limit ?? 20);
    },
    subscribe: (listener) => {
      let close: (() => void) | undefined;
      let active = true;
      const old = options.nodes.subscribe(listener);
      void options.database
        .then((db) => {
          if (active) close = db.subscribe(listener);
        })
        .catch(() => undefined);
      return () => {
        active = false;
        close?.();
        old();
      };
    },
    dispose: () => {
      disposed = true;
      for (const run of runs.values()) run.dispose();
    },
  };
}
