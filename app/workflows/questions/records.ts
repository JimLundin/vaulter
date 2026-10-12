// Questions owns retained requests for information independently of their presentation in Chat or Wiki.
import { z } from 'zod';
import { canonical, frozen } from '../../vault/nodes/json.ts';
import type { JsonObject } from '../../vault/nodes/model.ts';
import { text } from '../../vault/records/common.ts';

export const question = z.strictObject({
  kind: z.literal('question'),
  text,
  /** Giving up requires an explicit recorded choice; an absent answer does not establish it. */
  abandoned: z.literal(true).optional(),
});
export const questionSchemas = { question } as const;
export type QuestionData = z.infer<typeof question>;

/** Decode the original question shape without changing its recorded meaning or JSON. */
export function parseQuestion(value: unknown): QuestionData & JsonObject {
  canonical(value);
  question.parse(value);
  return frozen(structuredClone(value)) as QuestionData & JsonObject;
}
