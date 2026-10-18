import { definePage } from '@/core/navigation/index.ts';
import { QuestionsPage } from './QuestionsPage.tsx';
import { questionsRoute } from '@/modules/questions/routes.ts';
export const questionsPage = definePage({
  patterns: [questionsRoute],
  component: QuestionsPage,
  destination: { label: 'Questions', href: questionsRoute.href(), icon: 'help' },
  command: { id: 'go.questions', keys: 'g q' },
});
