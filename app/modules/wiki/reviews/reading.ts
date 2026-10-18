import {
  sameEntity,
  type EntityRef,
  type EntityDefinition,
  type Selected,
  type TransactionRef,
} from '@/core/store/index.ts';
import { selectedText } from '@/modules/wiki/content.ts';
import type { WikiReference, SupportState } from '@/modules/wiki/view.ts';
import type { Review, ReviewPassage } from './records.ts';
import type { WikiDatabase, readSelector } from './selection.ts';

export const reviewSelection = {
  key: true,
  assertion: { target: true, format: true, start: true, end: true },
  result: true,
  reviewer: { name: true },
  reviewedAt: true,
  rationale: true,
} as const;
export const passageSelection = {
  review: true,
  passage: { target: true, format: true, start: true, end: true },
} as const;

/** Review reading owns coverage, changed-text applicability and independent disagreement. */
export function reviewSupport(
  db: WikiDatabase,
  latest: TransactionRef,
  reviews: readonly Selected<typeof Review, typeof reviewSelection>[],
  passages: readonly Selected<typeof ReviewPassage, typeof passageSelection>[],
  selector: (selection: Parameters<typeof readSelector>[1]) => ReturnType<typeof readSelector>,
  sourceReference: (
    id: string,
    address: Parameters<typeof readSelector>[1]['target'],
    range: { start: number; end: number },
    claim: { start: number; end: number },
  ) => Promise<WikiReference>,
) {
  return async (
    entity: EntityRef<EntityDefinition>,
    text: string,
    format: 'wiki-text-utf16-v1' | 'wiki-summary-utf16-v1',
    fragments: { entity: EntityRef<EntityDefinition>; text: string; offset: number }[] = [],
  ) => {
    const spans: { start: number; end: number }[] = [];
    const evidence: WikiReference[] = [];
    let disputed = false,
      needsReview = false;
    // Historical targets retain their identity: discard unrelated reviews before resolving prose.
    const candidates = await Promise.all(
      [entity, ...fragments.map((item) => item.entity)].map((item) =>
        db.history.reference(latest, item),
      ),
    );
    const candidateIds = new Set(candidates.map((item) => item.entity));
    for (const review of reviews) {
      if (review.assertion.format !== format || !candidateIds.has(review.assertion.target.entity))
        continue;
      const original = await selector(review.assertion);
      const fragment = sameEntity(original.entity, entity)
        ? { text, offset: 0 }
        : fragments.find((item) => sameEntity(original.entity, item.entity));
      if (!fragment) continue;
      const { start, end } = review.assertion;
      let applicable = false;
      try {
        applicable = selectedText(fragment.text, start, end) === original.text;
      } catch {
        /* Changed text invalidates this selection. */
      }
      if (!applicable) {
        needsReview = true;
        continue;
      }
      if (review.result === 'supported')
        spans.push({ start: start + fragment.offset, end: end + fragment.offset });
      if (review.result === 'contradicted') disputed = true;
      if (review.result === 'deferred') needsReview = true;
      for (const link of passages.filter((item) => sameEntity(item.review, review))) {
        evidence.push(
          await sourceReference(
            `${review.key}:${evidence.length}`,
            link.passage.target,
            link.passage,
            { start: start + fragment.offset, end: end + fragment.offset },
          ),
        );
      }
    }
    const meaningful = [...text].some((character) => !/\s/.test(character));
    const covered = Array.from(
      { length: text.length },
      (_, index) =>
        /\s/.test(text[index]!) || spans.some((range) => range.start <= index && range.end > index),
    ).every(Boolean);
    const state: SupportState = {
      needsReference: meaningful && !covered,
      partlySupported: spans.length > 0 && !covered,
      supported: meaningful && covered,
      disputed,
      needsReview,
    };
    return { state, evidence };
  };
}
