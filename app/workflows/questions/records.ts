// Questions owns retained requests for information independently of their presentation in Chat or Wiki.
import { z } from 'zod';
import { canonical, frozen } from '@/vault/nodes/json.ts';
import type { JsonObject } from '@/vault/nodes/model.ts';
import { text } from '@/vault/records/common.ts';

const proposalText = z
  .string()
  .refine((value) => !!value.trim(), 'Suggested answers cannot be blank.');
/** Proposals prepared with the Question, never accepted Answer evidence. */
export const answerSuggestion = z.strictObject({
  title: proposalText,
  text: proposalText,
  reason: proposalText,
});
export const answerSuggestions = z
  .array(answerSuggestion)
  .min(1)
  .max(4)
  .refine(
    (items) => new Set(items.map((item) => item.title)).size === items.length,
    'Suggested answer titles must be distinct.',
  );

export const question = z.strictObject({
  kind: z.literal('question'),
  text,
  /** Giving up requires an explicit recorded choice; an absent answer does not establish it. */
  abandoned: z.literal(true).optional(),
  /** Older Questions have no suggestions; their wording and lifecycle remain readable. */
  suggestions: answerSuggestions.optional(),
});
export const answer = z.strictObject({
  kind: z.literal('answer'),
  text,
});
export type QuestionData = z.infer<typeof question>;
export type AnswerData = z.infer<typeof answer>;
export type AnswerSuggestion = z.infer<typeof answerSuggestion>;

/** Decode the original question shape without changing its recorded meaning or JSON. */
export function parseQuestion(value: unknown): QuestionData & JsonObject {
  canonical(value);
  question.parse(value);
  return frozen(structuredClone(value)) as QuestionData & JsonObject;
}

/** Retain the evidence recorded directly in response to a Question. */
export function parseAnswer(value: unknown): AnswerData & JsonObject {
  canonical(value);
  answer.parse(value);
  return frozen(structuredClone(value)) as AnswerData & JsonObject;
}
