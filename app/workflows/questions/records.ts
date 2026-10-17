// Questions owns retained requests for information independently of their presentation in Chat or Wiki.
import { z } from 'zod';

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

export type QuestionData = {
  readonly kind: 'question';
  readonly text: string;
  readonly suggestions?: readonly AnswerSuggestion[];
};
export type AnswerSuggestion = z.infer<typeof answerSuggestion>;
