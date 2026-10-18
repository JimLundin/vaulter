import { createDecision, reviseDecision, removeDecision } from '@/modules/decisions/index.ts';
import type { DecisionActions } from '@/modules/decisions/presentation/index.ts';
import { createTask, reviseTask } from '@/modules/tasks/index.ts';
import type { TaskActions } from '@/modules/tasks/presentation/index.ts';
import { applicationDatabase } from './database.ts';
export { applicationDatabase, applicationSchema } from './database.ts';
import { bindActor, readActorBinding } from '@/modules/actors/index.ts';
import { tool } from 'ai';
import { z } from 'zod';
import { questionCollection, questionAnswerActions } from '@/modules/questions/index.ts';
import { nativeQuestionTools, questionCapabilities } from '@/modules/questions/index.ts';
import { vaultHistory } from '@/core/history/eav.ts';
import type { JournalStorage } from '@/core/store/index.ts';
import {
  createEvent,
  reviseEvent,
  removeEvent,
  type CalendarData,
} from '@/modules/calendar/index.ts';
import type { CalendarActions } from '@/modules/calendar/presentation/index.ts';
import { sameEntity } from '@/core/store/index.ts';
import { wikiTools, wikiCapabilities } from '@/modules/wiki/index.ts';
import {
  graphTools,
  graphCapabilities,
  graphActions,
  type RelationshipCandidateActions,
} from '@/modules/graph/index.ts';
import { readWikiGraphTopics } from './wiki-graph.ts';
import { createEavChatBackend } from '@/modules/conversation/index.ts';
import type { ChatBackendFactory } from '@/modules/conversation/index.ts';
import { agentOptions, agentPreferences } from '@/modules/agent/index.ts';
import { createConversation, type ConversationOptions } from '@/modules/conversation/index.ts';
import { questionToolPresentation } from '@/modules/questions/presentation/index.tsx';
import { defaultIdentities, type ApplicationIdentities } from './identities.ts';
import { discoveryPresentation } from '@/modules/agent/presentation/index.ts';
import { readGraph } from '@/modules/graph/index.ts';
import {
  createCoordinates,
  reviseCoordinates,
  removeCoordinates,
  readCoordinates,
} from '@/modules/map/index.ts';
import type { MapActions, MapInput } from '@/modules/map/presentation/index.ts';

export const toolPresentations = [questionToolPresentation, discoveryPresentation];

type ApplicationChatOptions = Omit<
  ConversationOptions,
  'user' | 'agent' | 'backend' | 'enabledTools'
> & {
  readonly identities?: ApplicationIdentities;
  readonly eav: JournalStorage | null;
};

export function applicationGraph(storage: JournalStorage) {
  return applicationDatabase(storage).then(readGraph);
}
export function applicationRelationshipCandidates(
  storage: JournalStorage,
  identities: ApplicationIdentities,
  admission: () => string | undefined,
): RelationshipCandidateActions {
  const actions = async () => {
    const reason = admission();
    if (reason) throw new Error(reason);
    const db = await applicationDatabase(storage);
    const author = await db.transaction((tx) =>
      bindActor(tx, identities.user, 'user', 'Vault owner'),
    );
    const latestReason = admission();
    if (latestReason) throw new Error(latestReason);
    return graphActions(db, { author });
  };
  return {
    clarify: async (key, input) => {
      await (await actions()).clarify(key, input);
    },
    remove: async (key) => {
      await (await actions()).remove(key);
    },
  };
}
export function applicationGraphInput(storage: JournalStorage) {
  return {
    database: () => applicationDatabase(storage),
    endpointChoices: async () => {
      const db = await applicationDatabase(storage);
      const snapshot = await db.history.transactions.first({
        select: {},
        orderBy: [{ sequence: 'desc' }],
      });
      if (!snapshot) return [];
      const view = db.at(snapshot);
      const records = (
        await Promise.all([
          view.entities.wikiPages.query({
            select: { title: true },
            where: { available: { eq: true } },
            limit: null,
          }),
          view.entities.sourceDocuments.query({
            select: { title: true },
            where: { available: { eq: true } },
            limit: null,
          }),
          view.entities.calendarEvents.query({
            select: { title: true },
            where: { available: { eq: true } },
            limit: null,
          }),
          view.entities.questions.query({ select: {}, limit: null }),
        ])
      ).flat();
      return Promise.all(
        records.map(async (record) => ({
          address: await db.history.reference(snapshot, record),
          values: (await db.history.inspect(snapshot, record))?.values,
          state: 'available' as const,
        })),
      );
    },
  };
}
export function applicationWiki(storage: JournalStorage) {
  return {
    database: () => applicationDatabase(storage),
    topics: () => applicationDatabase(storage).then(readWikiGraphTopics),
  };
}
const questionCollections = new WeakMap<JournalStorage, ReturnType<typeof questionCollection>>();
export function applicationQuestionCollection(storage: JournalStorage) {
  let collection = questionCollections.get(storage);
  if (!collection) {
    collection = questionCollection(() => applicationDatabase(storage));
    questionCollections.set(storage, collection);
  }
  return collection;
}
export function applicationQuestionAnswers(
  storage: JournalStorage,
  identities: ApplicationIdentities,
  admission: () => string | undefined,
) {
  return questionAnswerActions({
    database: () => applicationDatabase(storage),
    user: identities.user,
    admission,
  });
}
export function applicationTasks(
  storage: JournalStorage,
  identities: ApplicationIdentities,
  admission: () => string | undefined,
) {
  const database = () => applicationDatabase(storage);
  const author = async () => {
    const reason = admission();
    if (reason) throw new Error(reason);
    const actor = await readActorBinding(await database(), identities.user, 'user');
    if (!actor) throw new Error('Vault owner identity is unavailable.');
    return actor;
  };
  const actions: TaskActions = {
    create: async (input) => {
      const actor = await author();
      await createTask(await database(), input, { author: actor });
    },
    revise: async (task, patch) => {
      const actor = await author();
      await reviseTask(await database(), task, patch, { author: actor });
    },
  };
  return { database, actions };
}

export function applicationCalendar(
  storage: JournalStorage,
  identities: ApplicationIdentities = defaultIdentities,
) {
  const author = async () => {
    const db = await applicationDatabase(storage);
    return db.transaction(async (tx) => bindActor(tx, identities.user, 'user', 'Vault owner'));
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

/** Application supplies foreign-record choices; Map retains only their historical identity. */
export function applicationMap(
  storage: JournalStorage,
  identities: ApplicationIdentities = defaultIdentities,
) {
  const author = async () => {
    const db = await applicationDatabase(storage);
    const binding = await db.entities.actorBindings.first({
      where: { key: { eq: identities.user } },
      select: { actor: { kind: true } },
    });
    if (!binding || binding.actor.kind !== 'user')
      throw new Error('Vault owner identity is unavailable.');
    return binding.actor;
  };
  const actions: MapActions = {
    create: async (input) => {
      await createCoordinates(await applicationDatabase(storage), input, {
        author: await author(),
      });
    },
    revise: async (record, coordinates) => {
      await reviseCoordinates(await applicationDatabase(storage), record, coordinates, {
        author: await author(),
      });
    },
    remove: async (record) => {
      await removeCoordinates(await applicationDatabase(storage), record, {
        author: await author(),
      });
    },
  };
  const input: MapInput = {
    read: async () => {
      const db = await applicationDatabase(storage);
      const snapshot = await db.history.transactions.first({
        select: {},
        orderBy: [{ sequence: 'desc' }],
      });
      if (!snapshot) return { entries: [], subjects: [] };
      const view = db.at(snapshot);
      const [coordinates, pages, events, questions, sources] = await Promise.all([
        readCoordinates(db, { snapshot }),
        view.entities.wikiPages.query({
          where: { available: { eq: true } },
          select: { title: true },
        }),
        view.entities.calendarEvents.query({
          where: { available: { eq: true } },
          select: { title: true },
        }),
        view.entities.questions.query({ select: {} }),
        view.entities.sourceDocuments.query({ select: {} }),
      ]);
      const subjects = await Promise.all(
        [...pages, ...events, ...questions, ...sources].map(async (entity) => {
          const reference = await db.history.reference(snapshot, entity);
          const retained = await db.history.inspect(snapshot, entity);
          const values = retained?.values ?? {};
          const title = ['title', 'text', 'name', 'question']
            .map((key) => values[key])
            .find((value) => typeof value === 'string' && value.trim());
          return {
            reference,
            label: typeof title === 'string' ? title.slice(0, 120) : reference.type,
          };
        }),
      );
      const entries = await Promise.all(
        coordinates.map(async (record) => {
          const target = await db.history.resolve(record.subject);
          const retained = await db.history.inspect(target.transaction, target.entity);
          const title = ['title', 'text', 'name', 'question']
            .map((key) => retained?.values[key])
            .find((value) => typeof value === 'string' && value.trim());
          const identity = await db.history.reference(snapshot, record);
          return {
            id: identity.entity,
            label: typeof title === 'string' ? title.slice(0, 120) : record.subject.type,
            record,
          };
        }),
      );
      return { entries, subjects };
    },
    subscribe: (listener) => {
      let active = true;
      let close: () => void = () => undefined;
      void applicationDatabase(storage)
        .then((db) => {
          if (active) close = db.subscribe(listener);
        })
        .catch(() => {
          if (active) listener();
        });
      return () => {
        active = false;
        close();
      };
    },
  };
  return { ...input, actions };
}

/** Match the original subject identity, independently of the snapshot retained by Calendar. */
export async function applicationSubjectCalendar(
  storage: JournalStorage,
  key: string,
  data: CalendarData,
): Promise<CalendarData> {
  const db = await applicationDatabase(storage);
  const page = await db.entities.wikiPages.first({ where: { key: { eq: key } }, select: {} });
  if (!page) return { events: [], annualDates: [] };
  const matches = async (address: import('@/core/store/index.ts').HistoricalReference) =>
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
const eavChatFactories = new WeakMap<JournalStorage, ChatBackendFactory>();
function conversationToolFactory(storage: JournalStorage): ChatBackendFactory {
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
  storage: JournalStorage,
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
        const actor = await readActorBinding(db, identities.user, 'user');
        if (!actor) throw new Error('Vault owner identity is unavailable.');
        return actor;
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
      ? conversationToolFactory(eav)
      : () => ({
          send: () => {
            throw new Error('Vault storage is unavailable.');
          },
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

export function applicationDecisions(
  storage: JournalStorage,
  identities: ApplicationIdentities = defaultIdentities,
) {
  const author = async () => {
    const db = await applicationDatabase(storage);
    const actor = await readActorBinding(db, identities.user, 'user');
    if (!actor) throw new Error('Vault owner identity is unavailable.');
    return actor;
  };
  const actions: DecisionActions = {
    create: async (input) => {
      await createDecision(await applicationDatabase(storage), input, { author: await author() });
    },
    revise: async (decision, patch) => {
      await reviseDecision(await applicationDatabase(storage), decision, patch, {
        author: await author(),
      });
    },
    remove: async (decision) => {
      await removeDecision(await applicationDatabase(storage), decision, {
        author: await author(),
      });
    },
  };
  return { database: () => applicationDatabase(storage), actions };
}
