import { e, type DomainDatabase } from '@/core/store/index.ts';
import { Actor, ActorBinding } from '@/modules/actors/index.ts';

export const QuestionRecord = e.entity('questions.question', {
  key: e.string(),
  text: e.string(),
  status: e.enum('open', 'answered', 'abandoned'),
  suggestions: e.json().optional(),
  createdAt: e.datetime(),
  available: e.boolean(),
});
/** A subject is a role of an existing identity, never a duplicated Subject record. */
export const QuestionContext = e.entity('questions.context', {
  question: e.ref(QuestionRecord),
  role: e.enum('subject', 'source', 'knowledge', 'review'),
  target: e.historicalRef(),
  order: e.number(),
});
/** The exact wording answered and the person's evidence remain independently readable. */
export const AnswerRecord = e.entity('questions.answer', {
  key: e.string(),
  question: e.ref(QuestionRecord),
  questionVersion: e.historicalRef(),
  text: e.string(),
  recordedAt: e.datetime(),
  available: e.boolean(),
});
export const questionEntities = {
  questions: QuestionRecord,
  questionContexts: QuestionContext,
  questionAnswers: AnswerRecord,
} as const;
export const questionSchema = e.registry({
  actors: Actor,
  actorBindings: ActorBinding,
  ...questionEntities,
});
export type QuestionDatabase = DomainDatabase<typeof questionSchema>;
