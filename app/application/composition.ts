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
import { graphTools, graphCapabilities } from '@/workflows/graph/data/tools.ts';
import { wikiEntities } from '@/workflows/wiki/data/schema.ts';
import { sourceEntities } from '@/vault/sources/schema.ts';
import { evidenceEntities } from '@/vault/evidence/schema.ts';
import { readWikiGraphTopics } from './wiki-graph.ts';
import { graphEntities } from '@/workflows/graph/data/schema.ts';
import { e } from '@/vault/eav/index.ts';
import { chatSchema } from '@/workflows/chat/data/schema.ts';
import { createEavChatBackend } from '@/workflows/chat/eav-backend.ts';
import type { ChatBackendFactory } from '@/workflows/chat/backend.ts';
import { agentOptions, agentPreferences } from '@/agent/settings.ts';
import { createConversation, type ConversationOptions } from '@/workflows/chat/conversation.ts';
import { questionToolPresentation } from '@/workflows/questions/tool-presentation.tsx';
import { defaultIdentities, type ApplicationIdentities } from './identities.ts';
import { discoveryPresentation } from '@/agent/discovery-presentation.tsx';
import { readGraph } from '@/workflows/graph/reading.ts';
import { mapEntities } from '@/map/index.ts';

export const toolPresentations = [questionToolPresentation, discoveryPresentation];

type ApplicationChatOptions = Omit<
  ConversationOptions,
  'user' | 'agent' | 'backend' | 'enabledTools'
> & {
  readonly identities?: ApplicationIdentities;
  readonly eav: MemoryStorage | null;
};

export function applicationGraph(storage: MemoryStorage) {
  return applicationDatabase(storage).then(readGraph);
}
export function applicationGraphInput(storage: MemoryStorage) {
  return { database: () => applicationDatabase(storage) };
}
/** The same explicit composition used by the Application views and independent application callers. */
export const applicationSchema = e.registry({
  ...chatSchema,
  ...wikiEntities,
  ...sourceEntities,
  ...evidenceEntities,
  ...graphEntities,
  ...calendarEntities,
  ...mapEntities,
  ...questionEntities,
});
const applicationDatabases = new WeakMap<
  MemoryStorage,
  ReturnType<typeof openDatabase<typeof applicationSchema>>
>();
export function applicationDatabase(storage: MemoryStorage) {
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
    topics: () => applicationDatabase(storage).then(readWikiGraphTopics),
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
        tools: async (context) => {
          if (!(context.author && context.run)) return {};
          const db = await applicationDatabase(storage);
          const trusted = { author: context.author, origin: context.run };
          return {
            ...graphTools(db, trusted, context.signal),
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
  storage: MemoryStorage,
  identities: ApplicationIdentities = defaultIdentities,
  admission: () => string | undefined = () => undefined,
) {
  return vaultHistory({
    database: () => applicationDatabase(storage),
    compensation: {
      types: [
        'wikiPages',
        'wikiContent',
        'wikiAppearances',
        'topics',
        'topicMemberships',
        'graphRelationships',
        'graphTerms',
        'graphQueries',
      ],
      author: async () => {
        const db = await applicationDatabase(storage);
        const binding = await db.entities.actorBindings.first({
          where: { key: { eq: identities.user } },
          select: { actor: { kind: true } },
        });
        if (!binding || binding.actor.kind !== 'user')
          throw new Error('Vault owner identity is unavailable.');
        return binding.actor;
      },
      admission: () => {
        const reason = admission();
        if (reason) throw new Error(reason);
      },
    },
  });
}
export function applicationChatOptions({
  eav,
  identities = defaultIdentities,
  ...options
}: ApplicationChatOptions): ConversationOptions {
  return {
    ...options,
    backend: eav
      ? eavChatFactory(eav)
      : () => ({
          continuous: true,
          send: () => {
            throw new Error('Vault storage is unavailable.');
          },
          chats: async () => [],
          messages: async () => [],
          subscribe: () => () => {},
          dispose: () => {},
        }),
    user: identities.user,
    agent: identities.agent,
    enabledTools: [
      ...wikiCapabilities,
      ...graphCapabilities,
      ...questionCapabilities,
      { name: 'listQuestionContext', version: '2' },
      { name: 'listQuestionSubjects', version: '2' },
    ],
    settings: options.settings ?? agentOptions(agentPreferences.values()),
  };
}
export function createApplicationConversation(options: ApplicationChatOptions) {
  return createConversation(applicationChatOptions(options));
}
