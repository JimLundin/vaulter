import { sameEntity, type TransactionRef } from '@/core/store/index.ts';
import type { TaskDatabase } from './records.ts';

/** Read the board and provenance at one accepted snapshot. Due dates do not move tasks automatically. */
export async function readTasks(db: TaskDatabase, snapshot?: TransactionRef) {
  const latest =
    snapshot ??
    (await db.history.transactions.first({ select: {}, orderBy: [{ sequence: 'desc' }] }));
  const view = latest ? db.at(latest) : db;
  const [tasks, sources] = await Promise.all([
    view.entities.tasks.query({
      limit: null, // The global board displays all available tasks.
      select: {
        title: true,
        description: true,
        status: true,
        dueDate: true,
        sourceStatus: true,
        available: true,
      },
      where: { available: { eq: true } },
      orderBy: [{ title: 'asc' }],
    }),
    view.entities.taskSources.query({
      limit: null, // Retain every provenance link in the snapshot projection.
      select: { task: true, source: true },
    }),
  ]);
  return tasks.map((task) => ({
    ...task,
    sources: sources
      .filter((source) => sameEntity(source.task, task))
      .map((source) => source.source),
  }));
}
export type TaskData = Awaited<ReturnType<typeof readTasks>>;
export type TaskRecord = TaskData[number];
