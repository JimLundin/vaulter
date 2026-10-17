import { expect, test } from 'vitest';
import { create, request, revise } from '@/vault/nodes/fixtures.test-support.ts';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { listWikiSubjects, readWikiSubject } from './subjects.ts';

test('Wiki discovers its live pages and sections through the full containment ancestry', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      create('collection', { kind: 'content' }),
      create('page', { kind: 'page', title: 'Studio' }, 'collection'),
      create('section', { kind: 'section' }, 'page'),
      create('detached', { kind: 'section' }),
      create('paragraph', { kind: 'paragraph', text: 'Morning light.' }, 'section'),
    ]),
  );
  const view = await nodes.snapshot();
  const read = new Set<string>();
  const subjects = listWikiSubjects(view, {
    ...view,
    get: (id) => {
      read.add(id);
      return view.get(id);
    },
    roots: () => {
      throw new Error('Enumeration must use the discovery snapshot');
    },
    children: () => {
      throw new Error('Enumeration must use the discovery snapshot');
    },
  });
  expect(subjects).toEqual([
    { node: 'page', title: 'Studio', kind: 'page' },
    { node: 'section', title: 'Studio', kind: 'section' },
  ]);
  expect(read).toEqual(new Set(['collection', 'page', 'section', 'detached']));
  expect(readWikiSubject(view, 'paragraph')).toBeUndefined();
  await nodes.commit(request('remove', [await revise(nodes, 'collection', null)]));
  const removed = await nodes.snapshot();
  expect(listWikiSubjects(removed)).toEqual([]);
  expect(readWikiSubject(removed, 'section')).toBeUndefined();
  expect(readWikiSubject(view, 'section')?.node).toBe('section');
  nodes.close();
});
