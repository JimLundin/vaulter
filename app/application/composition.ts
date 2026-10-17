import { tool } from 'ai';
import { z } from 'zod';
import { questionEntities } from '@/workflows/questions/data/schema.ts';
import { questionActions } from '@/workflows/questions/data/operations.ts';
import { readEavQuestions } from '@/workflows/questions/data/reading.ts';
import { nativeQuestionTools, questionCapabilities } from '@/workflows/questions/data/tools.ts';
import { vaultHistory } from '@/vault/transactions/history/eav.ts';
import { openDatabase, type MemoryStorage } from '@/vault/eav/index.ts';
import {
  calendarEntities,
  createEvent,
  reviseEvent,
  removeEvent,
  type CalendarActions,
  type CalendarData,
} from '@/calendar/index.ts';
import { sameEntity, SaveError } from '@/vault/eav/index.ts';
import { wikiTools, wikiCapabilities } from '@/workflows/wiki/data/tools.ts';
import { wikiEntities } from '@/workflows/wiki/data/schema.ts';
import { sourceEntities } from '@/vault/sources/schema.ts';
import { evidenceEntities } from '@/vault/evidence/schema.ts';
import { readTopics } from '@/workflows/graph/data/topics.ts';
import { topicEntities } from '@/workflows/graph/data/schema.ts';
import { e } from '@/vault/eav/index.ts';
import { chatSchema } from '@/workflows/chat/data/schema.ts';
import { createEavChatBackend } from '@/workflows/chat/eav-backend.ts';
import type { ChatBackendFactory } from '@/workflows/chat/backend.ts';
// Application-owned connections between record modules; no mounted views or shell state.
import type { NodeDifference, NodeStore } from '@/vault/nodes/store.ts';
import type { TransactionStore } from '@/vault/transactions/store.ts';
import { createTransactionSession } from '@/vault/transactions/lifetime.ts';
import { nodeContentTools, canUndoContent } from '@/vault/content/tools.ts';
import { contentEnabledTools } from '@/vault/content/tool-actions.ts';
import { contentToolPresentation } from '@/vault/content/tool-presentation.tsx';
import { preservesAgentRecords } from '@/agent/preservation.ts';
import type { AgentToolFactory, AgentToolContext } from '@/agent/tools.ts';
import { agentSources } from '@/agent/sources.ts';
import { agentOptions, agentPreferences } from '@/agent/settings.ts';
import { preservesChatRecords } from '@/workflows/chat/records/chat.ts';
import { chatSources } from '@/workflows/chat/records/sources.ts';
import { contentSources } from '@/vault/content/sources.ts';
import { retainedRecordSources } from '@/vault/records/sources.ts';
import { describeSource, type SourceReader } from '@/vault/sources.ts';
import {
  createNodeConversation,
  type NodeConversationOptions,
} from '@/workflows/chat/node-conversation.ts';
import { transactionHistory } from '@/vault/transactions/history/nodes.ts';
import { wikiSources as wikiSourceReader, describeWikiTarget } from '@/workflows/wiki/sources.ts';
import { questionToolPresentation } from '@/workflows/questions/tool-presentation.tsx';
import { defaultIdentities, type ApplicationIdentities } from './identities.ts';
import { conversationRoute } from './routes.ts';
import { discoveryPresentation } from '@/agent/discovery-presentation.tsx';
import { readGraph } from '@/workflows/graph/reading.ts';
import { graphSources } from '@/workflows/graph/sources.ts';
import type { GraphDescription } from '@/workflows/graph/explorer.ts';
import { graphRelatedContent } from '@/workflows/graph/related-content.ts';
import type { WikiRelatedContentReading } from '@/workflows/wiki/related-content.ts';

const contentKinds = ['content', 'relationship'];
const enabledContentTools = contentEnabledTools;
export const toolPresentations = [
  contentToolPresentation,
  questionToolPresentation,
  discoveryPresentation,
];
const chatSourceReader = chatSources((node) => `#${conversationRoute.href({ node })}`);
const sourceOwners = [
  chatSourceReader,
  contentSources,
  retainedRecordSources,
  graphSources,
  agentSources,
];
export const applicationSources: SourceReader = {
  exactText: (node, view) => {
    for (const owner of [...sourceOwners, wikiSourceReader]) {
      const text = owner.exactText?.(node, view);
      if (text !== undefined) return text;
    }
  },
  text: (node, context) => {
    for (const owner of sourceOwners) {
      const text = owner.text(node, context);
      if (text !== undefined) return text;
    }
  },
  describe: (node, view) => describeSource(node, view, sourceOwners),
};
export const applicationGraphDescription: GraphDescription = (node, view) =>
  describeWikiTarget(node, view) ?? applicationSources.describe(node, view);

export const applicationWikiGraph: WikiRelatedContentReading = graphRelatedContent;

/** Graph reads the same selected Vault snapshot as its caller's collection projections. */
export async function applicationGraph(
  nodes: Pick<TransactionStore, 'snapshot'>,
  sequence?: number,
) {
  return readGraph(await nodes.snapshot(sequence));
}
interface ApplicationNodeOwner {
  nodes: TransactionStore;
  readonly histories: Map<string, ReturnType<typeof transactionHistory>>;
  readonly transactions?: ReturnType<typeof createTransactionSession>;
  source: NodeStore | TransactionStore;
  session?: object;
}
const applicationNodeOwners = new WeakMap<object, ApplicationNodeOwner>();
const applicationStoreSessions = new WeakMap<object, ApplicationNodeOwner>();

/** Application supplies owner rules; the core owns the session and every publication attempt. */
export function applicationNodes(
  supplied: NodeStore | TransactionStore,
  session?: object,
): TransactionStore {
  let owner =
    (session && applicationStoreSessions.get(session)) ||
    applicationNodeOwners.get(supplied) ||
    ('writer' in supplied ? applicationNodeOwners.get(supplied.identity) : undefined);
  if (owner && session && owner.session && owner.session !== session) owner = undefined;
  if (!owner) {
    const transactions = 'writer' in supplied ? undefined : createTransactionSession(supplied);
    const reading = transactions?.nodes ?? (supplied as TransactionStore);
    owner = {
      nodes: reading,
      histories: new Map(),
      transactions,
      source: supplied,
    };
    applicationNodeOwners.set(reading.identity, owner);
    applicationNodeOwners.set(reading, owner);
    applicationNodeOwners.set(owner.nodes, owner);
  } else if (owner.source !== supplied && owner.nodes !== supplied) {
    let reading: TransactionStore;
    if ('writer' in supplied) {
      if (supplied.identity !== owner.nodes.identity)
        throw new Error('Adapter replacement must retain the Vault Transaction session.');
      reading = supplied;
    } else {
      if (!owner.transactions)
        throw new Error('Replace the adapter through its owning Vault Transaction session.');
      void owner.transactions.replace(supplied);
      reading = owner.transactions.nodes;
    }
    owner.nodes = reading;
    applicationNodeOwners.set(owner.nodes, owner);
    owner.source = supplied;
  }
  applicationNodeOwners.set(supplied, owner);
  if (session) {
    owner.session = session;
    applicationStoreSessions.set(session, owner);
  }
  return owner.nodes;
}

const applicationToolFactories = new WeakMap<TransactionStore, AgentToolFactory>();
function applicationTools(nodes: TransactionStore): AgentToolFactory {
  let factory = applicationToolFactories.get(nodes);
  if (!factory) {
    factory = (context) => createApplicationTools(context);
    applicationToolFactories.set(nodes, factory);
  }
  return factory;
}

/** Application composition for generic node History and guarded content compensation. */
export function applicationNodeHistory(
  source: NodeStore | TransactionStore,
  identities: ApplicationIdentities = defaultIdentities,
) {
  const nodes = applicationNodes(source);
  const histories = applicationNodeOwners.get(nodes)!.histories;
  const existing = histories.get(identities.user);
  if (existing) return existing;
  const canUndo = (difference: NodeDifference) =>
    preservesAgentRecords(difference) &&
    preservesChatRecords(difference) &&
    canUndoContent(difference);
  const history = transactionHistory(nodes, { recordedBy: identities.user, canUndo });
  histories.set(identities.user, history);
  return history;
}

type ApplicationChatOptions = Omit<
  NodeConversationOptions,
  'user' | 'agent' | 'tools' | 'writableKinds' | 'enabledTools' | 'nodes'
> & {
  readonly nodes: NodeStore | TransactionStore;
  readonly identities?: ApplicationIdentities;
  readonly eav?: MemoryStorage | null;
};
/** The same explicit composition used by the Application views and independent application callers. */
export const applicationSchema = e.registry({
  ...chatSchema,
  ...wikiEntities,
  ...sourceEntities,
  ...evidenceEntities,
  ...topicEntities,
  ...calendarEntities,
  ...questionEntities,
});
const applicationDatabases = new WeakMap<
  MemoryStorage,
  ReturnType<typeof openDatabase<typeof applicationSchema>>
>();
function applicationDatabase(storage: MemoryStorage) {
  let database = applicationDatabases.get(storage);
  if (!database) {
    database = openDatabase({ schema: applicationSchema, storage }).catch((error) => {
      applicationDatabases.delete(storage);
      throw error;
    });
    applicationDatabases.set(storage, database);
  }
  return database;
}
export function applicationWiki(storage: MemoryStorage) {
  return {
    database: () => applicationDatabase(storage),
    topics: () => applicationDatabase(storage).then(readTopics),
  };
}
const questionCollections = new WeakMap<MemoryStorage, ReturnType<typeof makeQuestionCollection>>();
function makeQuestionCollection(storage: MemoryStorage) {
  return {
    collection: () => applicationDatabase(storage).then(readEavQuestions),
    subscribe: (listener: () => void) => {
      let disposed = false;
      let unsubscribe: (() => void) | undefined;
      applicationDatabase(storage)
        .then((db) => {
          if (!disposed) unsubscribe = db.subscribe(listener);
        })
        .catch(listener);
      return () => {
        disposed = true;
        unsubscribe?.();
      };
    },
  };
}
export function applicationQuestionCollection(storage: MemoryStorage) {
  let collection = questionCollections.get(storage);
  if (!collection) {
    collection = makeQuestionCollection(storage);
    questionCollections.set(storage, collection);
  }
  return collection;
}
export function applicationQuestionAnswers(
  storage: MemoryStorage,
  identities: ApplicationIdentities,
  admission: () => string | undefined,
) {
  const check = () => {
    const reason = admission();
    if (reason) throw new Error(reason);
  };
  const answer = async (
    question: import('@/workflows/questions/reading.ts').Question,
    text: string,
  ): Promise<void> => {
    check();
    if (!question.evidence) throw new Error('Question has no native EAV address.');
    const db = await applicationDatabase(storage);
    let binding = await db.entities.actorBindings.first({
      where: { key: { eq: identities.user } },
      select: { actor: true },
    });
    if (!binding) {
      try {
        await db.transaction(async (tx) => {
          check();
          if (
            await tx.entities.actorBindings.first({
              where: { key: { eq: identities.user } },
              select: {},
            })
          )
            return;
          const actor = await tx.entities.actors.insert({ name: 'Vault owner', kind: 'user' });
          await tx.entities.actorBindings.insert({ key: identities.user, actor });
          check();
        });
      } catch (error) {
        if (error instanceof SaveError) {
          throw new SaveError(error.message, async () => {
            await error.retry();
            await answer(question, text);
          });
        }
        throw error;
      }
      binding = await db.entities.actorBindings.first({
        where: { key: { eq: identities.user } },
        select: { actor: true },
      });
    }
    if (!binding) throw new Error('Preparing Vault identities…');
    await questionActions(db, { author: binding.actor }, undefined, check).answer(
      question.evidence,
      text,
    );
  };
  return { answer };
}
export function applicationCalendar(
  storage: MemoryStorage,
  identities: ApplicationIdentities = defaultIdentities,
) {
  const author = async () => {
    const db = await applicationDatabase(storage);
    return db.transaction(async (tx) => {
      const binding = await tx.entities.actorBindings.first({
        where: { key: { eq: identities.user } },
        select: { actor: { kind: true } },
      });
      if (binding) {
        if (binding.actor.kind !== 'user')
          throw new Error('Configured Calendar author must be a user.');
        return binding.actor;
      }
      const actor = await tx.entities.actors.insert({ name: 'Vault owner', kind: 'user' });
      await tx.entities.actorBindings.insert({ key: identities.user, actor });
      return actor;
    });
  };
  const actions: CalendarActions = {
    create: async (input) => {
      const db = await applicationDatabase(storage);
      await createEvent(db, input, { author: await author() });
    },
    revise: async (event, input) => {
      await reviseEvent(await applicationDatabase(storage), event, input, {
        author: await author(),
      });
    },
    remove: async (event) => {
      await removeEvent(await applicationDatabase(storage), event, { author: await author() });
    },
  };
  return { database: () => applicationDatabase(storage), actions };
}

/** Match the original subject identity, independently of the snapshot retained by Calendar. */
export async function applicationSubjectCalendar(
  storage: MemoryStorage,
  key: string,
  data: CalendarData,
): Promise<CalendarData> {
  const db = await applicationDatabase(storage);
  const page = await db.entities.wikiPages.first({ where: { key: { eq: key } }, select: {} });
  if (!page) return { events: [], annualDates: [] };
  const matches = async (address: import('@/vault/eav/index.ts').HistoricalReference) =>
    sameEntity((await db.history.resolve(address)).entity, page);
  const events = await Promise.all(
    data.events.map(async (event) =>
      (await Promise.all(event.roles.map((role) => matches(role.subject)))).some(Boolean)
        ? event
        : undefined,
    ),
  );
  const dates = await Promise.all(
    data.annualDates.map(async (date) =>
      date.subject && (await matches(date.subject)) ? date : undefined,
    ),
  );
  return {
    events: events.filter((event) => event !== undefined),
    annualDates: dates.filter((date) => date !== undefined),
  };
}
const eavChatFactories = new WeakMap<MemoryStorage, ChatBackendFactory>();
function eavChatFactory(storage: MemoryStorage): ChatBackendFactory {
  let factory = eavChatFactories.get(storage);
  if (!factory) {
    factory = (options) =>
      createEavChatBackend({
        ...options,
        nativeTools: async (context) => {
          const db = await applicationDatabase(storage);
          const trusted = { author: context.author, origin: context.run };
          return {
            ...nativeQuestionTools(db, trusted, context.signal),
            listQuestionSubjects: tool({
              description:
                'List existing Wiki subjects with accepted EAV addresses. This does not promote broad Topics.',
              inputSchema: z.object({}),
              execute: async () => {
                context.signal.throwIfAborted();
                const snapshot = (await db.history.transactions.first({
                  select: {},
                  orderBy: [{ sequence: 'desc' }],
                }))!;
                const pages = await db.at(snapshot).entities.wikiPages.query({
                  where: { available: { eq: true } },
                  select: { key: true, title: true },
                  limit: 20,
                });
                return Promise.all(
                  pages.map(async (page) => ({
                    key: page.key,
                    title: page.title,
                    address: await db.history.reference(snapshot, page),
                  })),
                );
              },
            }),
            listQuestionContext: tool({
              description:
                'Read retained EAV source messages/documents and Wiki subject addresses for preparing a question. Exact addresses retain the supplied evidence.',
              inputSchema: z.object({}),
              execute: async () => {
                context.signal.throwIfAborted();
                const snapshot = (await db.history.transactions.first({
                  select: {},
                  orderBy: [{ sequence: 'desc' }],
                }))!;
                const view = db.at(snapshot);
                const [messages, documents, pages] = await Promise.all([
                  view.entities.messages.query({
                    select: { text: true },
                    limit: 20,
                    orderBy: [{ at: 'desc' }],
                  }),
                  view.entities.sourceDocuments.query({
                    select: { text: true, title: true },
                    where: { available: { eq: true } },
                    limit: 20,
                  }),
                  view.entities.wikiPages.query({
                    select: { key: true, title: true, summary: true },
                    where: { available: { eq: true } },
                    limit: 20,
                  }),
                ]);
                return {
                  sources: await Promise.all(
                    [...messages, ...documents].map(async (source) => ({
                      text: source.text,
                      address: await db.history.reference(snapshot, source),
                    })),
                  ),
                  knowledge: [],
                  subjects: await Promise.all(
                    pages.map(async (page) => ({
                      key: page.key,
                      title: page.title,
                      address: await db.history.reference(snapshot, page),
                    })),
                  ),
                };
              },
            }),
            ...wikiTools(db, {
              author: context.author,
              origin: context.run,
              signal: context.signal,
            }),
          };
        },
        get database() {
          return applicationDatabase(storage);
        },
      });
    eavChatFactories.set(storage, factory);
  }
  return factory;
}

export function applicationHistory(
  nodes: TransactionStore,
  identities: ApplicationIdentities,
  eav?: MemoryStorage | null,
) {
  return vaultHistory({
    nodes,
    legacy: applicationNodeHistory(nodes, identities),
    database: eav ? () => applicationDatabase(eav) : undefined,
  });
}
export function applicationChatOptions({
  eav,
  identities = defaultIdentities,
  ...options
}: ApplicationChatOptions): NodeConversationOptions {
  const nodes = applicationNodes(options.nodes);
  return {
    ...options,
    nodes,
    ...(eav && { backend: eavChatFactory(eav) }),
    user: identities.user,
    agent: identities.agent,
    tools: applicationTools(nodes),
    writableKinds: contentKinds,
    enabledTools: eav
      ? [
          ...enabledContentTools,
          ...wikiCapabilities,
          ...questionCapabilities,
          { name: 'listQuestionContext', version: '2' },
          { name: 'listQuestionSubjects', version: '2' },
        ]
      : enabledContentTools,
    settings: options.settings ?? agentOptions(agentPreferences.values()),
  };
}
export function createApplicationConversation(options: ApplicationChatOptions) {
  return createNodeConversation(applicationChatOptions(options));
}

/** Agent adapters connect module actions and retained evidence; record owners stay independent. */
export function createApplicationTools(context: AgentToolContext) {
  return {
    ...nodeContentTools(context),
  };
}
