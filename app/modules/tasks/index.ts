// biome-ignore-all lint/performance/noBarrelFile: Tasks expose their owner-defined record interface.
export { taskEntities, taskSchema } from './records.ts';
export type { TaskDatabase, TaskRef } from './records.ts';
export {
  createTask,
  reviseTask,
  removeTask,
  taskStatuses,
  boardStatuses,
  taskStatusLabels,
} from './operations.ts';
export type { TaskInput, TaskStatus } from './operations.ts';
export { readTasks } from './reading.ts';
export type { TaskData, TaskRecord } from './reading.ts';
export { tasksRoute } from './routes.ts';
