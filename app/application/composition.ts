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
import { sameEntity } from '@/vault/eav/index.ts';
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
import {
  agentDiscoveryTools,
  discoveryEnabledTools,
  validateAgentContext,
  type AgentContextReading,
} from '@/agent/discovery.ts';
// Application-owned connections between record modules; no mounted views or shell state.
import type { NodeDifference, NodeStore } from '@/vault/nodes/store.ts';
import type { TransactionStore } from '@/vault/transactions/store.ts';
import { createTransactionSession, withPublication } from '@/vault/transactions/lifetime.ts';
import { nodeContentTools, canUndoContent } from '@/vault/content/tools.ts';
import { contentEnabledTools } from '@/vault/content/tool-actions.ts';
import { contentToolPresentation } from '@/vault/content/tool-presentation.tsx';
import { preservesAgentRecords } from '@/agent/preservation.ts';
import type { AgentToolFactory, AgentToolContext } from '@/agent/tools.ts';
import { agentSources, isAgentContext } from '@/agent/sources.ts';
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
import { isWikiContent } from '@/workflows/wiki/citations.ts';
import { wikiSources as wikiSourceReader, describeWikiTarget } from '@/workflows/wiki/sources.ts';
import { questionTools } from '@/workflows/questions/tools.ts';
import { askQuestionInput, createQuestionOwnership } from '@/workflows/questions/actions.ts';
import { questionSources } from '@/workflows/questions/sources.ts';
import { questionEnabledTools } from '@/workflows/questions/tool-actions.ts';
import { questionToolPresentation } from '@/workflows/questions/tool-presentation.tsx';
import { defaultIdentities, type ApplicationIdentities } from './identities.ts';
import { conversationRoute } from './routes.ts';
import { discoveryPresentation } from '@/agent/discovery-presentation.tsx';
import { listWikiSubjects } from '@/workflows/wiki/subjects.ts';
import { readGraph } from '@/workflows/graph/reading.ts';
import { graphSources } from '@/workflows/graph/sources.ts';
import type { GraphDescription } from '@/workflows/graph/explorer.ts';
import { graphRelatedContent } from '@/workflows/graph/related-content.ts';
import type { WikiRelatedContentReading } from '@/workflows/wiki/related-content.ts';

const contentKinds = ['content', 'question', 'relationship'];
const enabledContentTools = [
  ...contentEnabledTools,
  ...questionEnabledTools,
  ...discoveryEnabledTools,
];
export const toolPresentations = [
  contentToolPresentation,
  questionToolPresentation,
  discoveryPresentation,
];
const chatSourceReader = chatSources((node) => `#${conversationRoute.href({ node })}`);
const sourceOwners = [
  chatSourceReader,
  contentSources,
  questionSources,
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
export const agentContextReading: AgentContextReading = {
  subjects: listWikiSubjects,
  text: (node, view) =>
    ['question', 'answer'].includes(String(node.data?.kind))
      ? undefined
      : applicationSources.exactText?.(node, view),
  isKnowledge: (node, view) => !isAgentContext(node) && isWikiContent(node, view),
  title: (node, view) =>
    applicationSources.describe(node, view)?.title ||
    describeWikiTarget(node, view)?.title ||
    'Retained source',
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
  readonly questions: ReturnType<typeof createQuestionOwnership>;
  readonly histories: Map<string, ReturnType<typeof transactionHistory>>;
  readonly transactions?: ReturnType<typeof createTransactionSession>;
  source: NodeStore | TransactionStore;
  session?: object;
}
const applicationNodeOwners = new WeakMap<object, ApplicationNodeOwner>();
const applicationQuestionSessions = new WeakMap<object, ApplicationNodeOwner>();

/** Application supplies owner rules; the core owns the session and every publication attempt. */
export function applicationNodes(
  supplied: NodeStore | TransactionStore,
  session?: object,
): TransactionStore {
  let owner =
    (session && applicationQuestionSessions.get(session)) ||
    applicationNodeOwners.get(supplied) ||
    ('writer' in supplied ? applicationNodeOwners.get(supplied.identity) : undefined);
  if (owner && session && owner.session && owner.session !== session) owner = undefined;
  if (!owner) {
    const transactions = 'writer' in supplied ? undefined : createTransactionSession(supplied);
    const reading = transactions?.nodes ?? (supplied as TransactionStore);
    const questions = createQuestionOwnership({ nodes: reading });
    owner = {
      nodes: withPublication(reading, questions.publication),
      questions,
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
    owner.nodes = withPublication(reading, owner.questions.publication);
    applicationNodeOwners.set(owner.nodes, owner);
    owner.source = supplied;
  }
  applicationNodeOwners.set(supplied, owner);
  if (session) {
    owner.session = session;
    applicationQuestionSessions.set(session, owner);
  }
  return owner.nodes;
}

export function applicationQuestions(source: TransactionStore) {
  return (applicationNodeOwners.get(source) ?? applicationNodeOwners.get(applicationNodes(source)))!
    .questions;
}
const applicationToolFactories = new WeakMap<TransactionStore, AgentToolFactory>();
function applicationTools(nodes: TransactionStore): AgentToolFactory {
  let factory = applicationToolFactories.get(nodes);
  if (!factory) {
    factory = (context) => createApplicationTools(context, nodes);
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
        nativeTools: async (context) =>
          wikiTools(await applicationDatabase(storage), {
            author: context.author,
            origin: context.run,
            signal: context.signal,
          }),
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
    enabledTools: eav ? [...enabledContentTools, ...wikiCapabilities] : enabledContentTools,
    settings: options.settings ?? agentOptions(agentPreferences.values()),
  };
}
export function createApplicationConversation(options: ApplicationChatOptions) {
  return createNodeConversation(applicationChatOptions(options));
}

/** Agent adapters connect module actions and retained evidence; record owners stay independent. */
export function createApplicationTools(
  context: AgentToolContext,
  nodes: TransactionStore,
  reading: AgentContextReading = agentContextReading,
) {
  const ownership = applicationQuestions(nodes);
  const questions = questionTools(context, nodes, ownership);
  return {
    ...nodeContentTools(context),
    ...agentDiscoveryTools(context, nodes, reading),
    ...questions,
    askQuestion: {
      ...questions.askQuestion,
      execute: async (
        ...[input, options]: Parameters<NonNullable<typeof questions.askQuestion.execute>>
      ) => {
        const chosen = askQuestionInput.parse(input);
        if (!context.author)
          throw new Error('Question creation requires a trusted Agent invocation.');
        const grounded = questionTools(
          {
            ...context,
            write: (calculate) =>
              context.write((id) => {
                // Classification and Question preparation must observe the same serialized Snapshot.
                validateAgentContext(context.snapshot(), chosen, reading);
                return calculate(id);
              }),
          },
          nodes,
          ownership,
        );
        return grounded.askQuestion.execute!(chosen, options);
      },
    },
  };
}
