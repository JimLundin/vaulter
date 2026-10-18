import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryStorage } from '@/core/store/index.ts';
import { savedQueryActions, querySelectionAdmission } from '@/modules/graph/index.ts';
import { createChronology } from '@/modules/calendar/index.ts';
import { applicationDatabase } from './composition/database.ts';
import { readEmbeddedRecord } from './composition/embeds.ts';

test('owner collection embeds distinguish current query data, captured results and chronology', async () => {
  await using db = await applicationDatabase(createMemoryStorage());
  const { page, source } = await db.transaction(async (tx) => ({
    page: await tx.entities.wikiPages.insert({
      key: 'page',
      title: 'Original title',
      summary: '',
      aliases: [],
      available: true,
      createdAt: new Date('2026-10-01T12:00:00Z'),
    }),
    source: await tx.entities.sourceDocuments.insert({
      key: 'source',
      title: 'Original query context',
      text: 'Preserved source',
      origin: 'import',
      attribution: 'Recorded',
      capturedAt: new Date('2026-10-01T12:00:00Z'),
      available: true,
    }),
  }));
  const query = await savedQueryActions(db).create({ key: 'all-pages' });
  const cutoff = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const queryAddress = await db.history.reference(cutoff, query);
  const pageAddress = await db.history.reference(cutoff, page);
  const sourceAddress = await db.history.retainedStateReference(cutoff, source);
  const selection = await db.transaction((tx) =>
    querySelectionAdmission(tx).capture({
      key: 'captured',
      query: queryAddress,
      origin: 'migration-evaluation',
      provenance: sourceAddress,
      members: [{ page: pageAddress, correspondence: sourceAddress, position: 0 }],
    }),
  );
  const chronology = await createChronology(db, { kind: 'collection' }, [
    { target: await db.history.retainedStateReference(cutoff, page), order: 'v' },
  ]);
  const host = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const selectionAddress = await db.history.reference(host, selection);
  const chronologyAddress = await db.history.reference(host, chronology);
  await db.transaction((tx) => tx.entities.wikiPages.update({ ...page, title: 'Current title' }));
  const html = async (target: typeof queryAddress, mode: 'live' | 'pinned' = 'live') =>
    renderToStaticMarkup(await readEmbeddedRecord(db, { mode, target }));
  expect(await html(queryAddress)).toContain('Current title');
  expect(await html(queryAddress, 'pinned')).toContain('Original title');
  expect(await html(selectionAddress)).toContain('Original title');
  expect(await html(chronologyAddress)).toContain('Original title');
});
