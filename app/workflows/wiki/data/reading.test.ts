import { expect, test } from 'vitest';
import { openDatabase } from '@/vault/eav/index.ts';
import { wikiSchema } from './schema.ts';
import { createEavWikiReading } from './reading.ts';
import type { WikiDatabase } from './evidence.ts';

test('native Wiki reading retains accepted pages through failed refresh and rejects late disposed opening', async () => {
  await using db = await openDatabase({ schema: wikiSchema });
  await db.transaction((tx) =>
    tx.entities.wikiPages.insert({
      key: 'page',
      title: 'Garden',
      summary: '',
      aliases: [],
      available: true,
      createdAt: new Date(),
    }),
  );
  let fail = false;
  const reader = createEavWikiReading({
    database: () => (fail ? Promise.reject(new Error('Offline')) : Promise.resolve(db)),
  });
  await reader.reload();
  expect(reader.snapshot().pages?.[0]?.title).toBe('Garden');
  fail = true;
  await reader.reload();
  expect(reader.snapshot()).toMatchObject({
    loading: false,
    error: 'Offline',
    pages: [expect.objectContaining({ title: 'Garden' })],
  });
  fail = false;
  await reader.reload();
  expect(reader.snapshot().error).toBeUndefined();
  reader.dispose();

  let release!: (value: WikiDatabase) => void;
  const opening = createEavWikiReading({
    database: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const pending = opening.reload();
  opening.dispose();
  release(db);
  await pending;
  expect(opening.snapshot().pages).toBeNull();
});
