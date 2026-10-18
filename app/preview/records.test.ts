import { expect, test } from 'vitest';
import { createMemoryStorage, openDatabase } from '@/core/store/index.ts';
import { applicationSchema } from '@/application/composition/composition.ts';
import { readEavWiki } from '@/modules/wiki/pages.ts';
import { seedEavWiki } from './wiki-records.ts';

test('fictional EAV evidence retains exact passages after source edits and deletion', async () => {
  await using db = await openDatabase({
    schema: applicationSchema,
    storage: createMemoryStorage(),
  });
  await seedEavWiki(db);
  const page = (await readEavWiki(db)).find((entry) => entry.id === 'preview:page:0')!;
  expect(page.blocks[0]!.evidence[0]).toMatchObject({
    title: 'Studio plans',
    text: 'Keep mornings free.',
    context: 'Earlier plans. '.repeat(40) + 'Keep mornings free.' + ' Later details.'.repeat(40),
    range: { start: 600, end: 619 },
    claim: { start: 0, end: 19 },
    state: 'newer',
  });
  expect(page.blocks[1]!.evidence[0]).toMatchObject({
    text: 'Afternoons are flexible.',
    state: 'deleted',
  });
  expect(page.sources).toHaveLength(12);
  const before = await db.history.transactions.query({ select: {} });
  await seedEavWiki(db);
  expect(await db.history.transactions.query({ select: {} })).toEqual(before);
});

test('fictional EAV exact selections resolve after pre-existing history', async () => {
  await using db = await openDatabase({
    schema: applicationSchema,
    storage: createMemoryStorage(),
  });
  await db.transaction((tx) => tx.entities.actors.insert({ name: 'Earlier owner', kind: 'user' }));
  await seedEavWiki(db);
  const page = (await readEavWiki(db)).find((entry) => entry.id === 'preview:page:0')!;
  expect(page.blocks[0]!.evidence[0]).toMatchObject({
    text: 'Keep mornings free.',
    range: { start: 600, end: 619 },
    state: 'newer',
  });
});

test('native comparison fixtures retain a dense graph with shared sources and open questions', {
  timeout: 20_000,
}, async () => {
  const { seedGraphEvidence } = await import('./graph-evidence.ts');
  const { seedGraphDensity } = await import('./graph-density.ts');
  await using db = await openDatabase({
    schema: applicationSchema,
    storage: createMemoryStorage(),
  });
  await seedEavWiki(db);
  await seedGraphEvidence(db);
  await seedGraphDensity(db);
  expect(await db.entities.topics.query({ select: {} })).toHaveLength(11);
  expect(await db.entities.questions.query({ select: {} })).toHaveLength(22);
  const studio = (await db.entities.wikiPages.first({
    where: { key: { eq: 'preview:graph-topic' } },
    select: {},
  }))!;
  expect(
    await db.entities.wikiAppearances.query({ where: { page: { eq: studio } }, select: {} }),
  ).toHaveLength(20);
  const recorded = (await db.entities.sourceDocuments.first({
    where: { key: { eq: 'preview:density:source:0' } },
    select: { text: true },
  }))!;
  expect(recorded.text).toContain('Later review');
  expect(await db.entities.reviews.query({ select: {} })).toHaveLength(77);
  const pages = await readEavWiki(db);
  expect(
    pages
      .find((page) => page.id === 'preview:graph-topic')!
      .blocks.some((block) => block.evidence.some((item) => item.state === 'newer')),
  ).toBe(true);
  const before = await db.history.transactions.query({ select: {} });
  await seedGraphEvidence(db);
  await seedGraphDensity(db);
  expect(await db.history.transactions.query({ select: {} })).toEqual(before);
});
