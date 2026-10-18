import { e, type EntityRef, type DomainDatabase } from '@/core/store/index.ts';

export const Task = e.entity('tasks.task', {
  title: e.string(),
  description: e.string(),
  status: e.enum('backlog', 'ready', 'in-progress', 'done', 'cancelled', 'abandoned'),
  dueDate: e.string().optional(),
  sourceStatus: e.string().optional(),
  available: e.boolean(),
});
export const TaskSource = e.entity('tasks.source', {
  task: e.ref(Task),
  source: e.historicalRef(),
});
export const taskEntities = { tasks: Task, taskSources: TaskSource } as const;
export const taskSchema = e.registry(taskEntities);
export type TaskDatabase = DomainDatabase<typeof taskEntities>;
export type TaskRef = EntityRef<typeof Task>;
