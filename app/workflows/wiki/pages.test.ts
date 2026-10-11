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
