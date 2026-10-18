import { applicationDatabase } from '@/application/composition/composition.ts';
import { createDecision } from '@/modules/decisions/index.ts';
import type { JournalStorage } from '@/core/store/index.ts';

/** Fictional records use the production Decision owner. */
export async function seedDecisions(storage: JournalStorage) {
  const db = await applicationDatabase(storage);
  if (await db.entities.decisions.first({ select: {} })) return;
  await createDecision(db, {
    text: 'Keep the studio open afternoon small and informal.',
    date: '2026-10-12',
    rationale: 'Leave enough time to talk with each neighbour.',
    attribution: 'Garden studio planning notes',
  });
  await createDecision(db, { text: 'Use the north wall for the reading shelves.' });
}
