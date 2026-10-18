import { expect, test, vi } from 'vitest';
import { e, openDatabase } from '@/core/store/index.ts';
import { graphEntities } from './records.ts';
import { createGraphExplorer } from './explorer.ts';
import type { GraphDatabase } from './reading.ts';

const schema = e.registry(graphEntities);

test('explorer releases its EAV subscription and ignores a database that finishes opening after disposal', async () => {
  await using db = await openDatabase({ schema });
  let release!: (value: GraphDatabase) => void;
  const pending = new Promise<GraphDatabase>((resolve) => {
    release = resolve;
  });
  const subscribe = vi.fn(db.subscribe);
  const tracked: GraphDatabase = { ...db, subscribe };
  const opening = createGraphExplorer({ database: () => pending });
  const refresh = opening.reload();
  opening.dispose();
  release(tracked);
  await refresh;
  expect(subscribe).not.toHaveBeenCalled();
  expect(opening.snapshot().subjects).toEqual([]);

  const reader = createGraphExplorer({ database: () => Promise.resolve(tracked) });
  await reader.reload();
  expect(subscribe).toHaveBeenCalledOnce();
  reader.dispose();
  await db.transaction(async (tx) => {
    await tx.entities.graphTerms.insert({
      key: 'place',
      scheme: 'type',
      label: 'Place',
      available: true,
    });
  });
  expect(reader.snapshot().subjects).toEqual([]);
});

test('failed refresh retains accepted results and exposes a retryable reading error', async () => {
  await using db = await openDatabase({ schema });
  await db.transaction(async (tx) => {
    await tx.entities.graphTerms.insert({
      key: 'place',
      scheme: 'type',
      label: 'Place',
      available: true,
    });
  });
  let fail = false;
  const reader = createGraphExplorer({
    database: () => {
      if (fail) return Promise.reject(new Error('Offline'));
      return Promise.resolve(db);
    },
  });
  await reader.reload();
  expect(reader.snapshot().subjects[0]?.title).toBe('Place');
  fail = true;
  await reader.reload();
  expect(reader.snapshot()).toMatchObject({
    loading: false,
    error: 'Offline',
    subjects: [expect.objectContaining({ title: 'Place' })],
  });
  fail = false;
  await reader.reload();
  expect(reader.snapshot().error).toBeUndefined();
  reader.dispose();
});
