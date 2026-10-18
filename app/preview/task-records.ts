import { createTask, type TaskDatabase } from '@/modules/tasks/index.ts';
/** Fictional tasks use the production owner admission and reading contracts. */
export async function seedTasks(db: TaskDatabase) {
  if (await db.entities.tasks.first({ select: {} })) return;
  for (const task of [
    {
      title: 'Choose bulbs for the garden',
      description: 'Look for varieties that flower at different times.',
      status: 'backlog' as const,
    },
    {
      title: 'Invite neighbours to the studio',
      description: '',
      status: 'ready' as const,
      dueDate: '2026-10-24',
    },
    {
      title: 'Prepare the reading corner',
      description: 'Finish the shelf and bring in a lamp.',
      status: 'in-progress' as const,
    },
    { title: 'Order the studio windows', description: '', status: 'done' as const },
    {
      title: 'Build a second garden shed',
      description: 'Keep the existing shed instead.',
      status: 'abandoned' as const,
    },
  ])
    await createTask(db, task);
}
