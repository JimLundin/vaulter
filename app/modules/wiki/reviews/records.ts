import { e } from '@/core/store/index.ts';
import { Actor } from '@/modules/actors/index.ts';

/** Exact selected text, with its own projection contract. No duplicate Claim record is required. */
export const TextSelector = e.entity('evidence.textSelector', {
  target: e.historicalRef(),
  format: e.enum('wiki-text-utf16-v1', 'wiki-summary-utf16-v1', 'source-text-utf16-v1'),
  start: e.number(),
  end: e.number(),
});
export const Review = e.entity('evidence.review', {
  key: e.string(),
  assertion: e.ref(TextSelector),
  reviewer: e.ref(Actor),
  reviewedAt: e.datetime(),
  result: e.enum('supported', 'contradicted', 'missing', 'deferred', 'navigation'),
  rationale: e.string(),
});
/** Supporting citations and challenges coexist, and belong to a particular review. */
export const ReviewPassage = e.entity('evidence.reviewPassage', {
  review: e.ref(Review),
  passage: e.ref(TextSelector),
});
export const evidenceEntities = {
  textSelectors: TextSelector,
  reviews: Review,
  reviewPassages: ReviewPassage,
} as const;
