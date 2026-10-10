import { expect, test } from 'vitest';
import { memoryNodeBackend } from './memory.ts';
import { create, request, seed, revise } from './fixtures.test-support.ts';
import { nodeClosure, undoNodes } from './operations-runtime.ts';

test('exact citations retain both endpoints through later versions, deletion, movement, and compensation', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  const before = await store.snapshot();
  await store.commit(
    request('citation', [
      create('claim', { text: 'Protect time for the studio.' }, 'page'),
      {
        ...create('citation', { range: { start: 0, end: 4 } }, 'claim'),
        connection: {
          source: { node: 'claim', transaction: 'citation' },
          target: { node: 'evidence', transaction: 'seed' },
        },
      },
    ]),
  );
  const citation = (await store.snapshot()).get('citation')!;
  await store.commit(
    request('revise', [await revise(store, 'evidence', { text: 'Changed evidence.' })]),
  );
  await store.commit(request('delete', [await revise(store, 'evidence', null)]));
  const now = await store.snapshot();
  expect(now.resolve(citation.connection!.target)?.data).toEqual({
    kind: 'paragraph',
    text: 'Keep mornings free.',
  });
  expect(now.resolve({ node: 'evidence' })?.data).toBeNull();
  expect(now.resolve({ node: 'evidence', transaction: 'citation' })).toBeUndefined();
  expect(before.resolve(citation.key)).toBeUndefined();
  expect(now.get('page')?.key).toEqual(before.get('page')?.key);
  expect(before.children('page')).toHaveLength(1);
  expect(now.children('page')).toHaveLength(2);
  expect((await nodeClosure(store, { node: 'page' })).some((v) => v.key.node === 'evidence')).toBe(
    true,
  );
  expect(Object.isFrozen(citation.connection!.target)).toBe(true);
  await undoNodes(store, 'citation', 'user');
  expect((await store.snapshot()).get('citation')?.data).toBeNull();
  expect((await store.snapshot()).resolve(citation.key)).toEqual(citation);
  store.close();
});

test('stale multi-node writes, declared reads, invalid references, and cycles reject atomically', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  const stale = await revise(store, 'evidence', { text: 'stale' });
  await store.commit(request('newer', [await revise(store, 'evidence', { text: 'newer' })]));
  const invalid = [
    request('stale', [await revise(store, 'page', { title: 'Must not publish' }), stale]),
    { ...request('read', [await revise(store, 'page', {})]), expectedReads: { evidence: 'seed' } },
    request('bad-pair', [
      {
        ...create('ref', {}),
        connection: {
          source: { node: 'page' },
          target: { node: 'user', transaction: 'newer' },
        },
      },
    ]),
    request('cycle', [
      { ...(await revise(store, 'page', {})), placement: { parent: 'appearance', order: 'a' } },
    ]),
  ];
  await Promise.all(invalid.map((bad) => expect(store.commit(bad)).rejects.toThrow()));
  expect((await store.snapshot()).sequence).toBe(2);
  expect((await store.snapshot()).get('page')?.data?.title).toBe('Studio');
  store.close();
});

test('identical retry is idempotent; content and metadata are frozen and changed retry is refused', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  const input = {
    ...request('retry', [await revise(store, 'evidence', { text: 'Once' })]),
    metadata: { imported: 3 },
  };
  const first = await store.commit(input);
  expect(await store.commit(structuredClone(input))).toEqual(first);
  await expect(store.commit({ ...input, metadata: { imported: 4 } })).rejects.toThrow('reused');
  expect(Object.isFrozen(first.metadata)).toBe(true);
  expect((await store.history({ limit: 1, beforeSequence: 2 }))[0].id).toBe('seed');
  expect(await store.history({ limit: 0 })).toEqual([]);
  const snap = await store.snapshot();
  await store.commit(request('later', [await revise(store, 'evidence', { text: 'Later' })]));
  expect(snap.get('evidence')?.data?.text).toBe('Once');
  store.close();
  expect(() => store.snapshot()).toThrow('closed');
});

test('closing the adapter rejects queued writes without accepting or notifying', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  let notified = false;
  store.subscribe(() => {
    notified = true;
  });
  const change = await revise(store, 'evidence', { text: 'Must not publish' });
  const pending = store.commit(request('queued', [change]));
  const rejected = expect(pending).rejects.toThrow('closed');
  store.close();
  await rejected;
  expect(notified).toBe(false);
});
