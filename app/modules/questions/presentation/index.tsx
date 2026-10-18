export type { QuestionAnswerHandler } from '@/modules/questions/answers.ts';
export {
  QuestionItem,
  type QuestionItemProps,
  type QuestionTargetDescription,
} from './QuestionItem.tsx';
export { QuestionsPage, type QuestionsPageProps } from './QuestionsPage.tsx';
export {
  createQuestionsReading,
  type Question,
  type QuestionAttribution,
  type QuestionTarget,
  type QuestionsReading,
  type QuestionsReadingState,
} from '@/modules/questions/reading.ts';
export {
  useQuestions,
  useQuestionsReading,
  useQuestionAnswers,
} from '@/modules/questions/presentation/use-questions.ts';
export {
  createQuestionAnswers,
  type QuestionAnswers,
  type QuestionAnswersOptions,
  type QuestionAnswerAttempt,
  type QuestionAnswersState,
} from '@/modules/questions/answers.ts';
export {
  EmbeddedQuestion,
  questionDescriptions,
  renderQuestionRecord,
  type EmbeddedQuestionProps,
} from './EmbeddedQuestion.tsx';
export { questionAnswerAvailability } from '@/modules/questions/availability.ts';
export { questionsRoute } from '@/modules/questions/routes.ts';
export { questionToolActions } from '@/modules/questions/tool-actions.ts';
export { QuestionToolReceipt, questionToolPresentation } from './tool-presentation.tsx';

export { questionsPage } from './routes.ts';
