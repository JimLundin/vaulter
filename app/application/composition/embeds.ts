import { createElement, type ReactNode } from 'react';
import { resolveEmbed, type RecordEmbed } from '@/core/embeds/index.ts';
import { resolveCurrentIdentity } from '@/core/identity/index.ts';
import {
  sameEntity,
  type EntityRef,
  type EntityDefinition,
  type TransactionRef,
} from '@/core/store/index.ts';
import { readEavQuestions } from '@/modules/questions/index.ts';
import { QuestionItem } from '@/modules/questions/presentation/index.tsx';
import { readCoordinates, decimalDegrees } from '@/modules/map/index.ts';
import { EmbeddedCoordinate } from '@/modules/map/presentation/index.ts';
import { readSourceLeads } from '@/modules/sources/index.ts';
import { SourceLeadView } from '@/modules/sources/presentation/index.ts';
import { readTasks } from '@/modules/tasks/index.ts';
import { TaskCard } from '@/modules/tasks/presentation/index.ts';
import { readDecisions } from '@/modules/decisions/index.ts';
import { DecisionList } from '@/modules/decisions/presentation/index.ts';
import { readObservations } from '@/modules/observations/index.ts';
import { EmbeddedObservation } from '@/modules/observations/presentation/index.ts';
import { Text } from '@/shared/ui/kit/index.ts';
import type { applicationDatabase } from './database.ts';
import { readTasks } from '@/modules/tasks/index.ts';
import { TaskCard } from '@/modules/tasks/presentation/index.ts';
import { readActorBinding } from '@/modules/actors/index.ts';
export type { WikiPage as EmbedHostPage } from '@/modules/wiki/index.ts';
import { wikiActions } from '@/modules/wiki/index.ts';
import {
  appendExchangeEmbed,
  readExchangeEmbeds,
  removeExchangeEmbed,
} from '@/modules/conversation/index.ts';
import type { EmbedChoice } from '@/core/embeds/presentation/index.tsx';

/** Choices and host destinations all come from one accepted state. */
export async function readEmbedChoices(db: EmbedDatabase) {
  const snapshot = await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  });
  if (!snapshot) return { choices: [], exchanges: [] };
  const [tasks, questions, coordinates, exchanges] = await Promise.all([
    readTasks(db, snapshot),
    readEavQuestions(db, snapshot),
    readCoordinates(db, { snapshot }),
    db.at(snapshot).entities.exchanges.query({
      limit: null,
      select: { position: true },
      orderBy: [{ position: 'desc' }],
    }),
  ]);
  const records = [
    ...tasks.map((record) => ({ record, label: `Task · ${record.title}` })),
    ...coordinates.map((record) => ({
      record,
      label: `Location · ${decimalDegrees(record.coordinates.latitude)}, ${decimalDegrees(record.coordinates.longitude)}`,
    })),
  ];
  const choices: EmbedChoice[] = await Promise.all(
    records.map(async ({ record, label }) => {
      const target = await db.history.reference(snapshot, record);
      return { key: `${target.type}:${target.entity}`, label, target };
    }),
  );
  choices.push(
    ...(await Promise.all(
      questions.map(async (question) => {
        const { entity } = await db.history.resolve(question.evidence);
        const target = await db.history.reference(snapshot, entity);
        return {
          key: `${target.type}:${target.entity}`,
          label: `Question · ${question.data.text}`,
          target,
        };
      }),
    )),
  );
  return {
    choices,
    exchanges: await Promise.all(
      exchanges.map(async (exchange) => ({
        reference: await db.history.reference(snapshot, exchange),
        label: `Exchange ${exchange.position + 1}`,
      })),
    ),
  };
}

export function embedHostActions(
  db: EmbedDatabase,
  user: string,
  admission: () => string | undefined,
) {
  const author = async () => {
    const reason = admission();
    if (reason) throw new Error(reason);
    const identity = await readActorBinding(db, user, 'user');
    if (!identity) throw new Error('Preparing Vault identities…');
    const currentReason = admission();
    if (currentReason) throw new Error(currentReason);
    return identity;
  };
  return {
    wiki: async (pageKey: string, embed: RecordEmbed) => {
      const identity = await author();
      const page = await db.entities.wikiPages.first({
        where: { key: { eq: pageKey }, available: { eq: true } },
        select: {},
      });
      if (!page) throw new Error('Page is unavailable');
      const placements = await db.entities.wikiAppearances.query({
        limit: null,
        where: { page: { eq: page }, available: { eq: true } },
        select: { order: true },
        orderBy: [{ order: 'desc' }],
      });
      return wikiActions(db, identity).append(
        `embed:${crypto.randomUUID()}`,
        { kind: 'embed', embedMode: embed.mode, embedTarget: embed.target },
        { page, order: `${placements[0]?.order ?? ''}z` },
      );
    },
    removeWiki: async (placement: string) =>
      wikiActions(db, await author()).removeAppearance(placement),
    chat: async (exchangeReference: RecordEmbed['target'], embed: RecordEmbed) => {
      const identity = await author();
      const { entity } = await db.history.resolve(exchangeReference);
      const exchange = await db.entities.exchanges.get(
        entity as Parameters<typeof appendExchangeEmbed>[1],
        { select: {} },
      );
      if (!exchange) throw new Error('Exchange is unavailable');
      const placements = await readExchangeEmbeds(db, exchange);
      return appendExchangeEmbed(
        db,
        exchange,
        embed,
        Math.max(-1, ...placements.map((item) => item.order)) + 1,
        { author: identity },
      );
    },
    removeChat: async (exchangeReference: RecordEmbed['target'], key: string) => {
      const identity = await author();
      const { entity } = await db.history.resolve(exchangeReference);
      const placements = await readExchangeEmbeds(
        db,
        entity as Parameters<typeof appendExchangeEmbed>[1],
      );
      for (const placement of placements) {
        const latest = (await db.history.transactions.first({
          select: {},
          orderBy: [{ sequence: 'desc' }],
        }))!;
        if ((await db.history.reference(latest, placement)).entity === key)
          return removeExchangeEmbed(db, placement, { author: identity });
      }
      throw new Error('Embed placement is unavailable');
    },
  };
}

export type EmbedDatabase = Awaited<ReturnType<typeof applicationDatabase>>;
/** Application installs additional owner views explicitly; hosts never import those owners. */
export type EmbeddedOwnerView = (
  database: EmbedDatabase,
  target: { type: string; entity: EntityRef<EntityDefinition>; snapshot: TransactionRef },
) => Promise<ReactNode | undefined>;

export async function readEmbeddedRecord(
  database: EmbedDatabase,
  embed: RecordEmbed,
  cutoff?: TransactionRef,
  ownerView?: EmbeddedOwnerView,
): Promise<ReactNode> {
  const current =
    embed.mode === 'live' && cutoff === undefined
      ? await resolveCurrentIdentity(database, embed.target)
      : undefined;
  const { entity, snapshot } = current ?? (await resolveEmbed(database, embed, cutoff));
  const target = current?.canonical ?? embed.target;
  if (embed.target.type === 'questions.question') {
    const questions = await readEavQuestions(database, snapshot);
    const question = questions.find((record) => record.evidence.entity === target.entity);
    if (question) return createElement(QuestionItem, { question });
  } else if (embed.target.type === 'map.coordinate') {
    const records = await readCoordinates(database, { snapshot });
    const record = records.find((candidate) => sameEntity(candidate, entity));
    if (record) return createElement(EmbeddedCoordinate, { record });
  } else if (embed.target.type === 'source.lead') {
    const records = await readSourceLeads(database, { snapshot });
    const lead = records.find((candidate) => sameEntity(candidate, entity));
    if (lead) return createElement(SourceLeadView, { lead });
  } else if (embed.target.type === 'tasks.task') {
    const records = await readTasks(database, snapshot);
    const task = records.find((candidate) => sameEntity(candidate, entity));
    if (task) return createElement(TaskCard, { task });
  } else if (embed.target.type === 'decision') {
    const records = await readDecisions(database, { snapshot });
    const decision = records.find((candidate) => sameEntity(candidate, entity));
    if (decision) return createElement(DecisionList, { decisions: [decision] });
  } else if (embed.target.type === 'observations.observation') {
    const records = await readObservations(database, { snapshot });
    const record = records.find((candidate) => sameEntity(candidate.ref, entity));
    if (record) return createElement(EmbeddedObservation, { record });
  } else {
    const view = await ownerView?.(database, { type: embed.target.type, entity, snapshot });
    if (view !== undefined) return view;
    return createElement(Text, { tone: 'muted' }, 'Embedded record presentation is unavailable.');
  }
  return createElement(
    Text,
    { tone: 'muted' },
    'This embedded record is missing or has been removed in the selected state.',
  );
}

export async function readChatEmbedPlacements(
  db: EmbedDatabase,
  reference: RecordEmbed['target'],
  choices: readonly EmbedChoice[],
) {
  const { entity } = await db.history.resolve(reference);
  const entries = await readExchangeEmbeds(db, entity as Parameters<typeof appendExchangeEmbed>[1]);
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  return Promise.all(
    entries.map(async (entry) => ({
      key: (await db.history.reference(snapshot, entry)).entity,
      mode: entry.mode,
      label:
        choices.find((choice) => choice.target.entity === entry.target.entity)?.label ??
        'Embedded record',
    })),
  );
}
