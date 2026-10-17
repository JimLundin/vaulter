import { modelMessageSchema } from 'ai';
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
import type { AgentRunState } from '../../agent/runtime.ts';
import type { chatSchema, ExchangeRef } from './data/schema.ts';
import { submitChat, readExchange } from './data/operations.ts';
import { migrateDialogue } from './data/migration.ts';
import { parseMessage } from './records/chat-schema.ts';
import { historyModelMessages } from '../../agent/history.ts';
import type { MessageData, MessagePart } from './records/chat.ts';
import type { NodeChatOptions, NodeChatRequest, NodeChatRunState } from './node-backend.ts';
import type { ChatBackend, ChatRun } from './backend.ts';

type DB = Database<typeof chatSchema>;
const migrations = new WeakMap<DB, Promise<void>>();
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

async function projectedExchange(
  tx: ReadView<typeof chatSchema>,
  identity: ExchangeRef,
): Promise<MessageData[]> {
  const exchange = await readExchange(tx, identity);
  if (!exchange) throw new Error('Dialogue contribution is unavailable');
  const result: MessageData[] = exchange.sources.map((source) =>
    parseMessage({
      kind: 'message',
      at: source.occurredAt,
      ...(source.speaker === 'agent'
        ? { role: 'agent', status: source.status ?? 'running', parts: source.activity ?? [] }
        : source.speaker === 'user'
          ? { role: 'user', text: source.text ?? '' }
          : {
              role: 'record',
              text: source.text ?? '',
              record: { kind: 'summary', ...(source.label && { label: source.label }) },
            }),
    }),
  );
  result.push(
    ...exchange.messages.map((message) => ({
      kind: 'message' as const,
      role: 'user' as const,
      at: message.at.toISOString(),
      text: message.text,
    })),
  );
  const run = exchange.execution;
  if (run) {
    const receipts = run.executions.map((execution) => ({
      kind: 'tool' as const,
      callId: execution.call,
      name: execution.tool.name,
      version: execution.tool.version,
      input: execution.input,
      status: execution.status,
      ...(execution.output !== undefined && { output: execution.output }),
      ...(execution.error !== undefined && { error: jsonError(execution.error) }),
    }));
    const parts: MessagePart[] = [];
    for (const step of run.steps) {
      const response = step.response;
      if (
        !(
          response &&
          typeof response === 'object' &&
          'messages' in response &&
          Array.isArray(response.messages)
        )
      )
        continue;
      for (const raw of response.messages) {
        const message = modelMessageSchema.parse(raw);
        if (message.role !== 'assistant') continue;
        if (typeof message.content === 'string')
          parts.push({ kind: 'text', text: message.content });
        else
          for (const block of message.content) {
            if (block.type === 'text') parts.push({ kind: 'text', text: block.text });
            if (block.type === 'tool-call') {
              const receipt = receipts.find((item) => item.callId === block.toolCallId);
              if (
                receipt &&
                !parts.some((item) => item.kind === 'tool' && item.callId === receipt.callId)
              )
                parts.push(receipt);
            }
          }
      }
    }
    // Partial or opaque external execution can expose receipts without an observable model response.
    for (const receipt of receipts)
      if (!parts.some((part) => part.kind === 'tool' && part.callId === receipt.callId))
        parts.push(receipt);
    if (
      run.output &&
      typeof run.output === 'object' &&
      'text' in run.output &&
      typeof run.output.text === 'string'
    ) {
      const recordedText = parts
        .flatMap((part) => (part.kind === 'text' ? [part.text] : []))
        .join('');
      const remaining = run.output.text.startsWith(recordedText)
        ? run.output.text.slice(recordedText.length)
        : '';
      if (remaining) parts.push({ kind: 'text', text: remaining });
    }
    result.push({
      kind: 'message',
      role: 'agent',
      at: run.startedAt.toISOString(),
      status: run.status,
      parts,
      model: run.servedModel ?? run.requestedModel,
      ...(run.inputTokens !== undefined &&
        run.outputTokens !== undefined && {
          tokens: { in: run.inputTokens, out: run.outputTokens },
        }),
      ...(run.error !== undefined && { error: jsonError(run.error) }),
    });
  }
  return result;
}

/** One continuous dialogue. Retained history and model-context projection are separate reads. */
export function createEavChatBackend(
  options: NodeChatOptions & { readonly database: Promise<DB> },
): ChatBackend {
  let disposed = false;
  const runs = new Map<string, { request: string; handle: ChatRun; dispose: () => void }>();
  const database = async () => {
    const db = await options.database;
    let migration = migrations.get(db);
    if (!migration) {
      migration = migrateDialogue(db, options.nodes).catch((error) => {
        migrations.delete(db);
        throw error;
      });
      migrations.set(db, migration);
    }
    await migration;
    return db;
  };
  const messages = async () => {
    const db = await database();
    return db.transaction(async (tx) => {
      const exchanges = await tx.entities.exchanges.query({
        select: {},
        orderBy: [{ position: 'asc' }],
      });
      return (await Promise.all(exchanges.map((exchange) => projectedExchange(tx, exchange))))
        .flat()
        .map((data) => ({ data }));
    });
  };
  const send = (input: NodeChatRequest): ChatRun => {
    if (disposed) throw new Error('Chat backend is disposed');
    const request = { ...input, conversation: 'dialogue', text: input.text.trim() };
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
        const db = await database();
        if (await restore(db)) return state;
        if (disposed || stopped) return state;
        const history = await messages();
        const context = history.flatMap(({ data }) =>
          data.role === 'record'
            ? [{ role: 'user' as const, content: `Retained summary source material: ${data.text}` }]
            : historyModelMessages([data]),
        );
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
            submitted = await submitChat(tx, {
              submission: request.id,
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
    continuous: true,
    chats: async () => [],
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
