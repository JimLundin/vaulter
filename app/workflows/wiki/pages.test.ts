import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, revise } from '../../vault/nodes/fixtures.test-support.ts';
import { readWiki } from './pages.ts';

test('exact composite citations retain source children and author at the original snapshot', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor', name: 'Original author' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('claim', { kind: 'paragraph' }, 'page'),
      create('words', { kind: 'run', text: 'Keep mornings free.' }, 'claim'),
      create('chat', { kind: 'conversation', title: 'Planning' }),
      create('exchange', { kind: 'exchange' }, 'chat'),
      create('message', { kind: 'message', text: 'Original quiet mornings.' }, 'exchange'),
      {
        ...create('cite', { kind: 'cite' }, 'claim'),
        connection: {
          source: { node: 'claim' },
          target: { node: 'exchange', transaction: 'original' },
        },
      },
    ]),
  );
  await nodes.commit(
    request('edited', [
      await revise(nodes, 'message', { kind: 'message', text: 'Changed afternoons.' }),
      await revise(nodes, 'user', { kind: 'actor', name: 'Renamed author' }),
    ]),
  );
  await nodes.commit(request('removed', [await revise(nodes, 'message', null)]));
  const pages = await readWiki(nodes, (node) => `#/chat/${node}/`);
  expect(pages[0]?.blocks[0]?.evidence[0]).toMatchObject({
    text: 'Original quiet mornings.',
    author: 'Original author',
    href: '#/chat/chat/',
  });
  nodes.close();
});

test('Wiki resolves ordered blocks, internal links and migrated live page queries', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      create('user', { kind: 'actor' }),
      create('page', { kind: 'page', title: 'Index' }),
      create('place', { kind: 'page', title: 'Studio', created: '2026-10-01' }),
      create('term', { kind: 'term', scheme: 'type', key: 'place' }),
      {
        ...create('type', { kind: 'relationship', predicate: 'type' }, 'place'),
        connection: { source: { node: 'place' }, target: { node: 'term' } },
      },
      create('query', { kind: 'query', type: 'place', sort: 'title' }, 'page'),
      {
        ...create('paragraph', { kind: 'paragraph' }, 'page'),
        placement: { parent: 'page', order: 'b' },
      },
      {
        ...create('link', { kind: 'link', text: 'Studio' }, 'paragraph'),
        connection: { source: { node: 'paragraph' }, target: { node: 'place' } },
      },
    ]),
  );
  const pages = await readWiki(nodes);
  const index = pages.find((page) => page.id === 'page')!;
  expect(index.blocks.map((block) => block.id)).toEqual(['query', 'paragraph']);
  expect(index.blocks[1]?.children[0]?.href).toBe('#/wiki/place/');
  expect(index.blocks[0]?.children.map((block) => block.data.text)).toEqual(['Studio']);
  nodes.close();
});

test('Wiki separates classifications and page provenance from statement support', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [
      create('user', { kind: 'actor', name: 'Importer' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('claim', { kind: 'paragraph' }, 'page'),
      {
        ...create('a', { kind: 'run', text: 'Keep ' }, 'claim'),
        placement: { parent: 'claim', order: 'a' },
      },
      {
        ...create('b', { kind: 'run', text: 'mornings free.', marks: ['strong'] }, 'claim'),
        placement: { parent: 'claim', order: 'b' },
      },
      create('area', { kind: 'term', scheme: 'area', key: 'work', label: 'Work' }),
      {
        ...create('tag', { kind: 'relationship', predicate: 'tag' }, 'page'),
        connection: { source: { node: 'page' }, target: { node: 'area' } },
      },
      create(
        'unresolved',
        { kind: 'relationship', predicate: 'tag', label: 'Original tag' },
        'page',
      ),
      create('source', { kind: 'conversation', title: 'Schedule' }),
      create('passage', { kind: 'paragraph' }, 'source'),
      create('source-words', { kind: 'run', text: 'Plan: Keep mornings free. End.' }, 'passage'),
      create('chat', { kind: 'conversation', title: 'Planning' }),
      create('exchange', { kind: 'exchange' }, 'chat'),
      create('message', { kind: 'message', text: 'Discuss mornings.' }, 'exchange'),
      {
        ...create('capture-link', { kind: 'link', text: 'Conversation' }, 'claim'),
        placement: { parent: 'claim', order: 'c' },
        connection: { source: { node: 'claim' }, target: { node: 'exchange' } },
      },
    ]),
  );
  await nodes.commit(
    request('citations', [
      ...['first', 'second'].map((id) => ({
        ...create(
          id,
          {
            kind: 'cite',
            unit: 'utf16',
            claim: { sequence: 1, start: 0, end: 19 },
            passage: { sequence: 1, start: 6, end: 25 },
          },
          'claim',
        ),
        connection: {
          source: { node: 'claim', transaction: 'seed' },
          target: { node: 'passage', transaction: 'seed' },
        },
      })),
      {
        ...create('page-reference', { kind: 'cite', scope: 'page', sequence: 1 }, 'page'),
        connection: { source: { node: 'page' }, target: { node: 'exchange', transaction: 'seed' } },
      },
    ]),
  );
  const wiki = await readWiki(nodes, (id) => `#/chat/${id}/`);
  const page = wiki.find((entry) => entry.id === 'page')!;
  expect(page.metadata).toMatchObject([
    { scheme: 'area', key: 'work', label: 'Work', state: 'resolved' },
    { label: 'Original tag', state: 'unresolved' },
  ]);
  expect(page.entry.g).toEqual(['work', 'Original tag']);
  expect(page.blocks.map((block) => block.data.kind)).toEqual(['paragraph']);
  expect(page.sources).toHaveLength(1);
  expect(page.sources[0]).toMatchObject({ title: 'Planning', context: 'Discuss mornings.' });
  expect(page.blocks[0].children.find((block) => block.id === 'capture-link')?.evidence).toEqual(
    [],
  );
  expect(page.blocks[0].evidence).toHaveLength(2);
  expect(page.blocks[0].evidence[0]).toMatchObject({
    title: 'Schedule',
    text: 'Keep mornings free.',
    context: 'Plan: Keep mornings free. End.',
    claim: { start: 0, end: 19 },
    range: { start: 6, end: 25 },
  });
  await nodes.commit(
    request('edit-source', [
      await revise(nodes, 'source-words', { kind: 'run', text: 'Different schedule.' }),
    ]),
  );
  const changed = (await readWiki(nodes)).find((entry) => entry.id === 'page')!;
  expect(changed.blocks[0].evidence[0]).toMatchObject({
    text: 'Keep mornings free.',
    state: 'newer',
  });
  await nodes.commit(request('remove-source', [await revise(nodes, 'passage', null)]));
  const deleted = (await readWiki(nodes)).find((entry) => entry.id === 'page')!;
  expect(deleted.blocks[0].evidence[0]).toMatchObject({
    context: 'Plan: Keep mornings free. End.',
    state: 'deleted',
  });
  await nodes.commit(
    request('edit-claim', [await revise(nodes, 'b', { kind: 'run', text: 'afternoons free.' })]),
  );
  expect((await readWiki(nodes)).find((entry) => entry.id === 'page')!.blocks[0].evidence).toEqual(
    [],
  );
  nodes.close();
});

test('historical sources remain exact beyond a full page of transaction history', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor', name: 'Original author' }),
      create('page', { kind: 'page', title: 'Studio' }),
      create('claim', { kind: 'paragraph' }, 'page'),
      create('words', { kind: 'run', text: 'Quiet mornings.' }, 'claim'),
      create('source', { kind: 'paragraph' }),
      create('source-words', { kind: 'run', text: 'Original passage.' }, 'source'),
      {
        ...create('cite', { kind: 'cite' }, 'claim'),
        connection: {
          source: { node: 'claim' },
          target: { node: 'source', transaction: 'original' },
        },
      },
    ]),
  );
  for (let index = 0; index < 205; index++) {
    // biome-ignore lint/performance/noAwaitInLoops: each revision depends on the preceding version
    await nodes.commit(
      request(`change-${index}`, [
        await revise(nodes, 'source-words', { kind: 'run', text: `Changed ${index}.` }),
      ]),
    );
  }
  const [page] = await readWiki(nodes);
  expect(page.blocks[0].evidence[0]).toMatchObject({
    text: 'Original passage.',
    author: 'Original author',
    state: 'newer',
  });
  nodes.close();
});
