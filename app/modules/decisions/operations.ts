import { z } from 'zod';
import { clear, type HistoricalReference, type TransactionContext } from '@/core/store/index.ts';
import type { DecisionDatabase, DecisionRef } from './records.ts';

const text = z.string().refine((value) => value.trim().length > 0, 'Decision text is required');
const fields = z
  .object({
    text,
    date: z.iso.date().optional(),
    rationale: z.string().optional(),
    attribution: z.string().optional(),
  })
  .strict();
export interface DecisionInput {
  text: string;
  /** Recorded civil date, without an invented time or timezone. Omit when unknown. */
  date?: string;
  rationale?: string;
  /** Exact supplied attribution, separate from the author of this publication. */
  attribution?: string;
  sources?: readonly HistoricalReference[];
}
export interface DecisionPatch {
  text?: string;
  date?: string | null;
  rationale?: string | null;
  attribution?: string | null;
}

export function createDecision(
  db: DecisionDatabase,
  input: DecisionInput,
  context: TransactionContext = {},
): Promise<DecisionRef> {
  const { sources = [], ...data } = input;
  const parsed = fields.parse(data);
  return db.transaction(context, async (tx) => {
    const decision = await tx.entities.decisions.insert({ ...parsed, available: true });
    await Promise.all(
      sources.map((source) => tx.entities.decisionSources.insert({ decision, source })),
    );
    return decision;
  });
}

export function reviseDecision(
  db: DecisionDatabase,
  decision: DecisionRef,
  patch: DecisionPatch,
  context: TransactionContext = {},
): Promise<void> {
  const data = fields
    .partial()
    .extend({
      date: z.iso.date().nullish(),
      rationale: z.string().nullish(),
      attribution: z.string().nullish(),
    })
    .parse(patch);
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.decisions.get(decision, { select: { available: true } });
    if (!current?.available) throw new Error('Decision is unavailable');
    await tx.entities.decisions.update({
      ...current,
      ...(data.text !== undefined && { text: data.text }),
      ...(data.date !== undefined && { date: data.date ?? clear }),
      ...(data.rationale !== undefined && { rationale: data.rationale ?? clear }),
      ...(data.attribution !== undefined && { attribution: data.attribution ?? clear }),
    });
  });
}

/** Removal changes availability only; text, date, rationale and provenance remain retained. */
export function removeDecision(
  db: DecisionDatabase,
  decision: DecisionRef,
  context: TransactionContext = {},
): Promise<void> {
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.decisions.get(decision, { select: { available: true } });
    if (!current?.available) throw new Error('Decision is unavailable');
    await tx.entities.decisions.update({ ...current, available: false });
  });
}
