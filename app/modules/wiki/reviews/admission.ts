import { z } from 'zod';
import type { Transaction, EntityRef } from '@/core/store/index.ts';
import type { Actor } from '@/modules/actors/index.ts';
import {
  readSelector,
  type SelectorInput,
  type SourceReading,
  type WikiDatabase,
} from './selection.ts';
import type { wikiSchema } from '@/modules/wiki/records.ts';

/** Review admission keeps selection validation and atomic recording together. */
export function reviewAdmission(
  db: WikiDatabase,
  author: EntityRef<typeof Actor>,
  sources: SourceReading,
  write: <T>(calculate: (tx: Transaction<typeof wikiSchema>) => Promise<T>) => Promise<T>,
) {
  return async (input: {
    key: string;
    assertion: SelectorInput;
    passages: SelectorInput[];
    result: 'supported' | 'contradicted' | 'missing' | 'deferred' | 'navigation';
    rationale: string;
  }) => {
    z.enum(['supported', 'contradicted', 'missing', 'deferred', 'navigation']).parse(input.result);
    if (input.assertion.format === 'source-text-utf16-v1')
      throw new Error('A Wiki review requires a Wiki assertion');
    if (!(input.key.trim() && input.rationale.trim()))
      throw new Error('A review requires an identity and rationale');
    if (['supported', 'contradicted'].includes(input.result) && !input.passages.length)
      throw new Error('This review result requires evidence');
    await readSelector(db, input.assertion, sources);
    for (const passage of input.passages) {
      if (passage.format !== 'source-text-utf16-v1')
        throw new Error('Evidence must select retained source material');
      await readSelector(db, passage, sources);
    }
    return write(async (tx) => {
      const prior = await tx.entities.reviews.first({
        where: { key: { eq: input.key } },
        select: {},
      });
      if (prior) throw new Error('Review identity is already in use');
      const assertion = await tx.entities.textSelectors.insert(input.assertion);
      const review = await tx.entities.reviews.insert({
        key: input.key,
        assertion,
        reviewer: author,
        reviewedAt: new Date(),
        result: input.result,
        rationale: input.rationale,
      });
      for (const inputPassage of input.passages) {
        const passage = await tx.entities.textSelectors.insert(inputPassage);
        await tx.entities.reviewPassages.insert({ review, passage });
      }
      return review;
    });
  };
}
