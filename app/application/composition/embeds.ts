import { createElement, type ReactNode } from 'react';
import { resolveEmbed, type RecordEmbed } from '@/core/embeds/index.ts';
import {
  sameEntity,
  type EntityRef,
  type EntityDefinition,
  type TransactionRef,
} from '@/core/store/index.ts';
import { readEavQuestions } from '@/modules/questions/index.ts';
import { QuestionItem } from '@/modules/questions/presentation/index.tsx';
import { readCoordinates } from '@/modules/map/index.ts';
import { EmbeddedCoordinate } from '@/modules/map/presentation/index.ts';
import { readTasks } from '@/modules/tasks/index.ts';
import { TaskCard } from '@/modules/tasks/presentation/index.ts';
import { readDecisions } from '@/modules/decisions/index.ts';
import { DecisionList } from '@/modules/decisions/presentation/index.ts';
import { readObservations } from '@/modules/observations/index.ts';
import { EmbeddedObservation } from '@/modules/observations/presentation/index.ts';
import { Text } from '@/shared/ui/kit/index.ts';
import type { applicationDatabase } from './database.ts';

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
  const { entity, snapshot } = await resolveEmbed(database, embed, cutoff);
  if (embed.target.type === 'questions.question') {
    const questions = await readEavQuestions(database, snapshot);
    const question = questions.find((record) => record.evidence.entity === embed.target.entity);
    if (question) return createElement(QuestionItem, { question });
  } else if (embed.target.type === 'map.coordinate') {
    const records = await readCoordinates(database, { snapshot });
    const record = records.find((candidate) => sameEntity(candidate, entity));
    if (record) return createElement(EmbeddedCoordinate, { record });
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
