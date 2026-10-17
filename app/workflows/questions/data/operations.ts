import { z } from 'zod';
import {
  sameEntity,
  type HistoricalReference,
  type EntityRef,
  type TransactionContext,
} from '@/vault/eav/index.ts';
import { answerSuggestions } from '@/workflows/questions/records.ts';
import type { Actor } from '@/vault/records/actor.ts';
import type { QuestionRecord, QuestionDatabase } from './schema.ts';

export const historicalAddress = z.strictObject({
  format: z.literal('vaulter-eav-snapshot-v1'),
  scope: z.string().min(1),
  journal: z.string().min(1),
  transaction: z.string().min(1),
  entity: z.string().min(1),
  type: z.string().min(1),
});
export const askInput = z.strictObject({
  key: z.string().min(1).optional(),
  text: z.string().trim().min(1),
  suggestions: answerSuggestions,
  subject: historicalAddress.optional(),
  source: historicalAddress,
  knowledge: z.array(historicalAddress).max(6),
  review: historicalAddress.optional(),
});

/** Caller supplies trusted identity; model arguments cannot choose the writer or origin. */
export function questionActions(
  db: QuestionDatabase,
  context: TransactionContext,
  signal?: AbortSignal,
  admission?: () => void,
) {
  const check = () => {
    signal?.throwIfAborted();
    admission?.();
  };
  const actor = async (kind: 'user' | 'agent') => {
    if (
      !context.author ||
      (
        await db.entities.actors.get(context.author as EntityRef<typeof Actor>, {
          select: { kind: true },
        })
      )?.kind !== kind
    )
      throw new Error(
        kind === 'user'
          ? 'Only a person can record a direct Answer.'
          : 'Questions are created by an Agent action.',
      );
  };
  return {
    ask: async (input: z.input<typeof askInput>) => {
      const data = askInput.parse(input);
      check();
      await actor('agent');
      if (data.source.type.startsWith('wiki.'))
        throw new Error('Question source must be retained source material.');
      if (data.review && data.review.type !== 'evidence.review')
        throw new Error('Question review context must address an Evidence review.');
      const contexts = [
        ...(data.subject ? [{ role: 'subject' as const, target: data.subject }] : []),
        { role: 'source' as const, target: data.source },
        ...data.knowledge.map((target) => ({ role: 'knowledge' as const, target })),
        ...(data.review ? [{ role: 'review' as const, target: data.review }] : []),
      ];
      await Promise.all(contexts.map((entry) => db.history.resolve(entry.target)));
      return db.transaction(context, async (tx) => {
        check();
        const key = data.key ?? crypto.randomUUID();
        if (await tx.entities.questions.first({ where: { key: { eq: key } }, select: {} }))
          throw new Error('Question identity is already in use.');
        const question = await tx.entities.questions.insert({
          key,
          text: data.text,
          suggestions: data.suggestions,
          status: 'open',
          createdAt: new Date(),
          available: true,
        });
        await Promise.all(
          contexts.map((entry, order) =>
            tx.entities.questionContexts.insert({ question, ...entry, order }),
          ),
        );
        check();
        return question;
      });
    },
    answer: async (address: HistoricalReference, text: string) => {
      const value = z.string().trim().min(1).parse(text);
      check();
      await actor('user');
      const resolved = await db.history.resolve(address);
      if (address.type !== 'questions.question') throw new Error('Question is unavailable.');
      const original = await db
        .at(resolved.transaction)
        .entities.questions.get(resolved.entity as EntityRef<typeof QuestionRecord>, {
          select: { text: true, status: true, suggestions: true, available: true },
        });
      return db.transaction(context, async (tx) => {
        check();
        const current =
          original &&
          (await tx.entities.questions.get(original, {
            select: { text: true, status: true, available: true },
          }));
        if (!(current?.available && original?.available))
          throw new Error('Question is unavailable.');
        if (current.status !== 'open') throw new Error('Only an open Question can be answered.');
        const latest = await db.history.entities.questions.first({
          where: { entity: { eq: current } },
          select: { transaction: {} },
          orderBy: [{ sequence: 'desc' }],
        });
        if (!(latest && sameEntity(latest.transaction, resolved.transaction)))
          throw new Error('Question has changed; review its current wording before answering.');
        const answer = await tx.entities.questionAnswers.insert({
          key: crypto.randomUUID(),
          question: current,
          questionVersion: address,
          text: value,
          recordedAt: new Date(),
          available: true,
        });
        await tx.entities.questions.update({ ...current, status: 'answered' });
        check();
        return answer;
      });
    },
    abandon: async (address: HistoricalReference) => {
      check();
      await actor('user');
      const resolved = await db.history.resolve(address);
      if (address.type !== 'questions.question') throw new Error('Question is unavailable.');
      return db.transaction(context, async (tx) => {
        check();
        const current = await tx.entities.questions.get(
          resolved.entity as EntityRef<typeof QuestionRecord>,
          { select: { status: true, available: true } },
        );
        if (!current?.available || current.status !== 'open')
          throw new Error('Only an open Question can be abandoned.');
        const latest = await db.history.entities.questions.first({
          where: { entity: { eq: current } },
          select: { transaction: {} },
          orderBy: [{ sequence: 'desc' }],
        });
        if (!(latest && sameEntity(latest.transaction, resolved.transaction)))
          throw new Error('Question has changed; review its current wording.');
        await tx.entities.questions.update({ ...current, status: 'abandoned' });
        check();
      });
    },
  };
}
