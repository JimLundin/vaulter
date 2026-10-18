import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryStorage } from '@/core/store/index.ts';
import { createIdentityRedirect } from '@/core/identity/index.ts';
import { applicationDatabase } from './composition/database.ts';
import { readEmbeddedRecord } from './composition/embeds.ts';

test('live embedded questions follow identity merges while pinned and historical hosts retain the original', async () => {
  await using db = await applicationDatabase(createMemoryStorage());
  const { original, survivor } = await db.transaction(async (tx) => ({
    original: await tx.entities.questions.insert({
      key: 'original',
      text: 'Original question?',
      status: 'open',
      createdAt: new Date(),
      available: true,
    }),
    survivor: await tx.entities.questions.insert({
      key: 'survivor',
      text: 'Surviving question?',
      status: 'open',
      createdAt: new Date(),
      available: true,
    }),
  }));
  const cutoff = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const target = await db.history.reference(cutoff, original);
  const destination = await db.history.reference(cutoff, survivor);
  await createIdentityRedirect(db, { source: target, target: destination });
  expect(renderToStaticMarkup(await readEmbeddedRecord(db, { mode: 'live', target }))).toContain(
    'Surviving question?',
  );
  expect(renderToStaticMarkup(await readEmbeddedRecord(db, { mode: 'pinned', target }))).toContain(
    'Original question?',
  );
  expect(
    renderToStaticMarkup(await readEmbeddedRecord(db, { mode: 'live', target }, cutoff)),
  ).toContain('Original question?');
});
