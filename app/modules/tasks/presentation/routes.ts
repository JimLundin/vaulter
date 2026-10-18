import { definePage } from '@/core/navigation/index.ts';
import { tasksRoute } from '@/modules/tasks/routes.ts';
import { TasksPage } from './TasksPage.tsx';
export const tasksPage = definePage({
  patterns: [tasksRoute],
  component: TasksPage,
  destination: { label: 'Tasks', href: tasksRoute.href(), icon: 'check' },
  command: { id: 'go.tasks', keys: 'g t' },
});
