// biome-ignore-all lint/performance/noBarrelFile: This domain exposes its behavior through one owner entry.
export { questionEntities, questionSchema } from './records.ts';
export type { QuestionDatabase } from './records.ts';
export { questionActions } from './operations.ts';
export { questionCollection, questionAnswerActions } from './collection.ts';
export { readEavQuestions, readTarget } from './projection.ts';
export { nativeQuestionTools, questionCapabilities } from './tools.ts';
export { answerSuggestions } from './suggestions.ts';
export type { QuestionData, AnswerSuggestion } from './suggestions.ts';
export { createQuestionsReading } from './reading.ts';
export type { Question, QuestionTarget, QuestionCollection } from './reading.ts';
