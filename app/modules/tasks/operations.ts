import { z } from 'zod';
import { clear, type HistoricalReference, type TransactionContext } from '@/core/store/index.ts';
import { parseTime } from '@/modules/calendar/index.ts';
import type { TaskDatabase, TaskRef } from './records.ts';

export const taskStatuses = [
  'backlog',
  'ready',
  'in-progress',
  'done',
  'cancelled',
  'abandoned',
] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export const boardStatuses = taskStatuses.slice(0, 4);
export const taskStatusLabels: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  'in-progress': 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
  abandoned: 'Abandoned',
};
const fields = z
  .object({
    title: z.string().refine((value) => value.trim().length > 0, 'Task title must not be blank'),
    description: z.string(),
    status: z.enum(taskStatuses),
  })
  .strict();
export interface TaskInput {
  title: string;
  description: string;
  status: TaskStatus;
  dueDate?: string;
  sourceStatus?: string;
  sources?: readonly HistoricalReference[];
}
function dueDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Expected a civil due date: YYYY-MM-DD');
  parseTime({
    kind: 'point',
    point: {
      precision: 'day',
      year: Number(value.slice(0, 4)),
      month: Number(value.slice(5, 7)),
      day: Number(value.slice(8)),
    },
    approximate: false,
  });
  return value;
}
export function createTask(
  db: TaskDatabase,
  input: TaskInput,
  context: TransactionContext = {},
): Promise<TaskRef> {
  const data = fields.parse({
    title: input.title,
    description: input.description,
    status: input.status,
  });
  const date = input.dueDate === undefined ? undefined : dueDate(input.dueDate);
  const sourceStatus =
    input.sourceStatus === undefined ? undefined : z.string().min(1).parse(input.sourceStatus);
  return db.transaction(context, async (tx) => {
    const task = await tx.entities.tasks.insert({
      ...data,
      ...(date && { dueDate: date }),
      ...(sourceStatus && { sourceStatus }),
      available: true,
    });
    await Promise.all(
      (input.sources ?? []).map((source) => tx.entities.taskSources.insert({ task, source })),
    );
    return task;
  });
}
/** A cleared due date is explicit. Completion and cancellation never invent occurrence times. */
export function reviseTask(
  db: TaskDatabase,
  task: TaskRef,
  patch: Partial<Pick<TaskInput, 'title' | 'description' | 'status'>> & { dueDate?: string | null },
  context: TransactionContext = {},
): Promise<void> {
  const { dueDate: date, ...rest } = patch;
  const data = fields.partial().parse(rest);
  const parsedDate = typeof date === 'string' ? dueDate(date) : date;
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.tasks.get(task, { select: { available: true } });
    if (!current?.available) throw new Error('Task is unavailable');
    await tx.entities.tasks.update({
      ...current,
      ...data,
      ...(parsedDate === null
        ? { dueDate: clear }
        : parsedDate === undefined
          ? {}
          : { dueDate: parsedDate }),
    });
  });
}
export function removeTask(
  db: TaskDatabase,
  task: TaskRef,
  context: TransactionContext = {},
): Promise<void> {
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.tasks.get(task, { select: { available: true } });
    if (!current?.available) throw new Error('Task is unavailable');
    await tx.entities.tasks.update({ ...current, available: false });
  });
}
