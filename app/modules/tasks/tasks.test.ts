import { expect, test } from 'vitest';
import {
  SaveError,
  e,
  openDatabase,
  createPersistentStorage,
  sameEntity,
  type Journal,
} from '@/core/store/index.ts';
import {
  taskSchema,
  taskEntities,
  createTask,
  reviseTask,
  removeTask,
  readTasks,
} from './index.ts';

test('status changes preserve identity, civil due dates, original import status and earlier snapshots', async () => {
  await using db = await openDatabase({ schema: taskSchema });
  const task = await createTask(db, {
    title: 'Renew membership',
    description: '',
    status: 'backlog',
    dueDate: '2026-10-04',
    sourceStatus: 'open',
  });
  const original = (await db.history.transactions.first({ select: {} }))!;
  await reviseTask(db, task, { status: 'in-progress' });
  await reviseTask(db, task, { status: 'done' });
  expect((await readTasks(db))[0]).toMatchObject({
    status: 'done',
    dueDate: '2026-10-04',
    sourceStatus: 'open',
  });
  expect(sameEntity((await readTasks(db))[0]!, task)).toBe(true);
  expect((await readTasks(db, original))[0]).toMatchObject({
    status: 'backlog',
    dueDate: '2026-10-04',
  });
  await reviseTask(db, task, { status: 'cancelled', dueDate: null });
  expect((await readTasks(db))[0]).toMatchObject({ status: 'cancelled' });
  expect((await readTasks(db))[0]!.dueDate).toBeUndefined();
  await removeTask(db, task);
  expect(await readTasks(db)).toEqual([]);
  await expect(reviseTask(db, task, { status: 'ready' })).rejects.toThrow('unavailable');
  expect((await readTasks(db, original))[0]!.status).toBe('backlog');
});

test('reject invalid civil dates and unknown workflow statuses before publishing', async () => {
  await using db = await openDatabase({ schema: taskSchema });
  expect(() =>
    createTask(db, {
      title: 'Impossible',
      description: '',
      status: 'ready',
      dueDate: '2026-02-29',
    }),
  ).toThrow();
  expect(() =>
    createTask(db, {
      title: 'Impossible',
      description: '',
      status: 'ready',
      dueDate: '2026-10-18T00:00:00Z',
    }),
  ).toThrow();
  expect(() => createTask(db, { title: ' ', description: '', status: 'ready' })).toThrow();
  expect(await readTasks(db)).toEqual([]);
});

test('durable reopen retains source evidence and cancelled tasks without assigning completion times', async () => {
  const Source = e.entity('test.source', { text: e.string() });
  const schema = e.registry({ sources: Source, ...taskEntities });
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'tasks-durability',
      load: async () => structuredClone(journal),
      append: (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
        return Promise.resolve();
      },
    });
  {
    await using db = await openDatabase({ schema, storage: storage() });
    const source = await db.transaction((tx) =>
      tx.entities.sources.insert({ text: 'A source task' }),
    );
    const snapshot = (await db.history.transactions.first({ select: {} }))!;
    const reference = await db.history.reference(snapshot, source);
    const task = await createTask(db, {
      title: 'Old task',
      description: '',
      status: 'backlog',
      sourceStatus: 'open',
      sources: [reference],
    });
    await reviseTask(db, task, { status: 'cancelled' });
    await db.transaction((tx) => tx.entities.sources.delete(source));
  }
  await using db = await openDatabase({ schema, storage: storage() });
  const [task] = await readTasks(db);
  expect(task).toMatchObject({ title: 'Old task', status: 'cancelled', sourceStatus: 'open' });
  const resolved = await db.history.resolve(task!.sources[0]!);
  expect(await db.history.inspect(resolved.transaction, resolved.entity)).toMatchObject({
    values: { text: 'A source task' },
  });
});

test('failed acceptance leaves no current task or source', async () => {
  const storage = createPersistentStorage({
    scope: 'tasks-failure',
    load: async () => ({ schemas: [], commits: [] }),
    append: () => Promise.reject(new Error('Storage unavailable')),
  });
  await using db = await openDatabase({ schema: taskSchema, storage });
  await expect(
    createTask(db, { title: 'Unsaved', description: '', status: 'backlog' }),
  ).rejects.toThrow();
  expect(await readTasks(db)).toEqual([]);
});

test('an accepted publication with a lost response retries the exact task instead of duplicating it', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  let fail = true;
  const requests: string[] = [];
  const storage = createPersistentStorage({
    scope: 'tasks-retry',
    load: async () => structuredClone(journal),
    append: (request) => {
      requests.push(request.commit.id);
      if (!journal.commits.some((commit) => commit.id === request.commit.id))
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
      if (fail) {
        fail = false;
        return Promise.reject(new Error('Lost response'));
      }
      return Promise.resolve();
    },
  });
  await using db = await openDatabase({ schema: taskSchema, storage });
  let failure: unknown;
  try {
    await createTask(db, { title: 'One task', description: '', status: 'ready' });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(SaveError);
  if (!(failure instanceof SaveError)) throw new Error('Expected finalized save');
  await failure.retry();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toBe(requests[1]);
  expect(await readTasks(db)).toHaveLength(1);
});

test('task creation and revision retain exact task text while rejecting blank titles', async () => {
  await using db = await openDatabase({ schema: taskSchema });
  const title = '  Renew membership\n';
  const task = await createTask(db, {
    title,
    description: '  Recorded task details\n',
    status: 'backlog',
    sourceStatus: 'open',
  });
  expect((await readTasks(db))[0]).toMatchObject({
    title,
    description: '  Recorded task details\n',
  });
  await reviseTask(db, task, { title: '\tRenew annual membership  ' });
  expect((await readTasks(db))[0]!.title).toBe('\tRenew annual membership  ');
  expect(() => createTask(db, { title: ' \n\t ', description: '', status: 'backlog' })).toThrow();
  expect(() => reviseTask(db, task, { title: ' \n ' })).toThrow();
});
