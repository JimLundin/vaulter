import { applicationWikiGraph } from '../application/composition.ts';
import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import { retainedRecordSources } from '../vault/records/sources.ts';
import { describeSource, type SourceReader } from '../vault/sources.ts';
import { readWiki } from '../workflows/wiki/pages.ts';
import { seedPreviewRecords } from './records.ts';

const sources: SourceReader = {
  text: retainedRecordSources.text,
  describe: (node, view) => describeSource(node, view, [retainedRecordSources]),
};

test('fictional retained nodes resolve exact selected passages with newer and removed source context', async () => {
  const nodes = memoryNodeBackend();
  await seedPreviewRecords(nodes);
  const pages = await readWiki(nodes, sources, applicationWikiGraph);
  const page = pages.find((entry) => entry.id === 'preview:page:0')!;
  expect(page.blocks[0].evidence[0]).toMatchObject({
    title: 'Studio plans',
    text: 'Keep mornings free.',
    context: 'Earlier plans. '.repeat(40) + 'Keep mornings free.' + ' Later details.'.repeat(40),
    range: { start: 600, end: 619 },
    claim: { start: 0, end: 19 },
    state: 'newer',
    href: 'https://example.invalid/planning/1',
    source: { node: 'preview:source:0', transaction: 'preview:evidence-original' },
  });
  expect(page.blocks[1].evidence[0]).toMatchObject({
    text: 'Afternoons are flexible.',
    state: 'deleted',
    source: { node: 'preview:source:1', transaction: 'preview:evidence-original' },
  });
  expect(page.sources).toHaveLength(12);
  const before = await nodes.history();
  await seedPreviewRecords(nodes);
  expect(await nodes.history()).toEqual(before);
  nodes.close();
});

test('fictional exact selections use the accepted sequence after pre-existing journal history', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit({
    id: 'earlier-journal',
    recordedBy: 'earlier-owner',
    origin: null,
    undoOf: null,
    kind: { scope: 'node', action: 'create' },
    message: null,
    changes: [
      {
        node: 'earlier-owner',
        expected: null,
        placement: null,
        connection: null,
        data: { kind: 'actor' },
      },
    ],
  });
  await seedPreviewRecords(nodes);
  const page = (await readWiki(nodes, sources, applicationWikiGraph)).find(
    (entry) => entry.id === 'preview:page:0',
  )!;
  expect(page.blocks[0].evidence[0]).toMatchObject({
    text: 'Keep mornings free.',
    range: { start: 600, end: 619 },
    sequence: 3,
    state: 'newer',
  });
  nodes.close();
});
