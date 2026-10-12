import { expect, test } from 'vitest';
import { memoryNodeBackend } from './nodes/memory.ts';
import { create, request } from './nodes/fixtures.test-support.ts';
import { describeSource, type SourceReader } from './sources.ts';

test('historical source description selects the nearest direct owner and clears inherited capture', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('outer', { kind: 'outer', title: 'Outer source' }),
      create('inner', { kind: 'inner', title: 'Nearest source' }, 'outer'),
      create('paragraph', { kind: 'paragraph' }, 'inner'),
      create('flat', { kind: 'flat', title: 'Independent source' }, 'outer'),
    ]),
  );
  const view = await nodes.snapshot();
  const reader = (kind: string, href?: string): SourceReader => ({
    text: () => undefined,
    describe: (node) =>
      node.data?.kind === kind
        ? {
            title: String(node.data.title),
            href,
            capture: true,
          }
        : undefined,
  });
  const readers = [
    reader('outer', '#/outer/'),
    reader('inner', 'https://example.com'),
    reader('flat'),
  ];
  expect(describeSource(view.get('inner')!, view, readers)).toEqual({
    title: 'Nearest source',
    href: 'https://example.com',
    capture: true,
  });
  expect(describeSource(view.get('paragraph')!, view, readers)).toEqual({
    title: 'Nearest source',
    href: 'https://example.com',
    capture: false,
  });
  expect(describeSource(view.get('flat')!, view, readers)).toEqual({
    title: 'Independent source',
    href: undefined,
    capture: true,
  });
  expect(describeSource(view.get('user')!, view, readers)).toBeUndefined();
  nodes.close();
});
