import { expect, test } from 'vitest';
import { createMemoryStorage } from '@/core/store/index.ts';
import { resolveEmbed } from '@/core/embeds/index.ts';
import {
  createChronology,
  reviseChronology,
  readChronologies,
  type ChronologyRef,
} from '@/modules/calendar/index.ts';
import { wikiActions, readEavWiki } from '@/modules/wiki/index.ts';
import { applicationDatabase } from './composition/database.ts';

test('Wiki placement embeds live or pinned Calendar chronology and respects historical host cutoff', async () => {
  await using db = await applicationDatabase(createMemoryStorage());
  const author = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Owner', kind: 'user' }),
  );
  const chronology = await createChronology(db, {
    kind: 'collection',
    label: 'Original chronology',
  });
  const original = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const target = await db.history.reference(original, chronology);
  const wiki = wikiActions(db, author);
  const page = await wiki.createPage({ key: 'chronology-page', title: 'Page', summary: '' });
  await wiki.append('live', { kind: 'embed', embedTarget: target }, { page, order: 'a' });
  await wiki.append(
    'pinned',
    { kind: 'embed', embedTarget: target, embedMode: 'pinned' },
    { page, order: 'b' },
  );
  const host = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await reviseChronology(db, chronology, { kind: 'collection', label: 'Updated chronology' });
  const { blocks } = (await readEavWiki(db))[0]!;
  const read = async (block: (typeof blocks)[number]) => {
    const resolved = await resolveEmbed(db, block.embed!, block.embedCutoff);
    return readChronologies(db, {
      snapshot: resolved.snapshot,
      chronology: resolved.entity as ChronologyRef,
    });
  };
  expect((await read(blocks[0]!))[0]!.label).toBe('Updated chronology');
  expect((await read(blocks[1]!))[0]!.label).toBe('Original chronology');
  const historical = (await readEavWiki(db, undefined, host))[0]!.blocks;
  expect((await read(historical[0]!))[0]!.label).toBe('Original chronology');
});
