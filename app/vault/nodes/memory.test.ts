import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from './memory.ts';
import { create, request, seed, revise } from './fixtures.test-support.ts';
import { nodeClosure, undoNodes } from './operations-runtime.ts';

test('live publication policy sees complete immutable state and can veto every proposed change atomically', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  await store.commit(request('removed', [await revise(store, 'evidence', null)]));
  await store.commit(request('retagged', [await revise(store, 'evidence', { kind: 'other' })]));
  const input = request('vetoed', [
    await revise(store, 'page', { title: 'Must not publish' }),
    {
      ...create('linked', { text: 'Proposed' }, 'page'),
      connection: {
        source: { node: 'linked', transaction: 'vetoed' },
        target: { node: 'evidence', transaction: 'seed' },
      },
    },
    { ...(await revise(store, 'appearance', { kind: 'appearance' })), placement: null },
  ]);
  const notify = vi.fn();
  store.subscribe(notify);
  await expect(
    store.commit(input, ({ request: proposed, before, after, versions }) => {
      expect(proposed).toEqual(input);
      expect(proposed).not.toBe(input);
      expect(Object.isFrozen(proposed.changes[0].data)).toBe(true);
      expect(before.sequence).toBe(3);
      expect(after.sequence).toBe(4);
      expect(before.get('page')?.data?.title).toBe('Studio');
      expect(after.get('page')?.data?.title).toBe('Must not publish');
      expect(before.resolve({ node: 'linked', transaction: 'vetoed' })).toBeUndefined();
      expect(after.resolve({ node: 'linked', transaction: 'vetoed' })?.data?.text).toBe('Proposed');
      expect(after.resolve({ node: 'user', transaction: 'vetoed' })).toBeUndefined();
      expect(after.resolve({ node: 'evidence', transaction: 'seed' })?.data?.text).toBe(
        'Keep mornings free.',
      );
      expect(before.children('page').map((version) => version.key.node)).toEqual(['appearance']);
      expect(after.children('page').map((version) => version.key.node)).toEqual(['linked']);
      expect(after.roots().map((version) => version.key.node)).toContain('appearance');
      expect(versions('evidence').map((version) => version.data)).toEqual([
        { kind: 'paragraph', text: 'Keep mornings free.' },
        null,
        { kind: 'other' },
      ]);
      expect(Object.isFrozen(versions('evidence'))).toBe(true);
      expect(Object.isFrozen(versions('evidence')[0].data)).toBe(true);
      expect(versions('linked')).toEqual([]);
      throw new Error('Owner action required');
    }),
  ).rejects.toThrow('Owner action required');
  const current = await store.snapshot();
  expect(current.sequence).toBe(3);
  expect(current.get('page')?.data?.title).toBe('Studio');
  expect(current.get('linked')).toBeUndefined();
  expect(current.children('page').map((version) => version.key.node)).toEqual(['appearance']);
  expect(notify).not.toHaveBeenCalled();
  store.close();
});

test('generic integrity runs before publication policy and accepted exact retries do not require policy again', async () => {
  const store = memoryNodeBackend();
  const publish = vi.fn();
  const initial = request('initial', [create('user', { kind: 'actor' })]);
  const accepted = await store.commit(initial, publish);
  expect(publish).toHaveBeenCalledOnce();
  const unavailable = vi.fn(() => {
    throw new Error('Action lifetime has ended');
  });
  expect(await store.commit(structuredClone(initial), unavailable)).toEqual(accepted);
  await expect(store.commit({ ...initial, message: 'Changed retry' }, unavailable)).rejects.toThrow(
    'reused',
  );
  await expect(
    store.commit(request('invalid', [create('child', {}, 'unknown')]), unavailable),
  ).rejects.toThrow('Unknown parent');
  await expect(
    store.commit(request('stale', [create('user', { kind: 'other' })]), unavailable),
  ).rejects.toThrow('Conflict');
  expect(unavailable).not.toHaveBeenCalled();
  expect((await store.snapshot()).sequence).toBe(1);
  store.close();
});

test('an asynchronous publication rule cannot accept new history', async () => {
  const store = memoryNodeBackend();
  await expect(
    store.commit(request('async', [create('user', { kind: 'actor' })]), async () => undefined),
  ).rejects.toThrow('must run synchronously');
  expect((await store.snapshot()).sequence).toBe(0);
  expect((await store.snapshot()).get('user')).toBeUndefined();
  store.close();
});

test('node content and transaction metadata retain every JSON key without changing retry identity', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  const data = JSON.parse(
    '{"__proto__":{"text":"original"},"constructor":2,"prototype":3,"nested":{"__proto__":4}}',
  );
  const input = { ...request('json-keys', [create('json', data)]), metadata: data };
  const first = await store.commit(input);
  const snapshot = await store.snapshot();
  expect(snapshot.get('json')?.data).toEqual(data);
  expect(first.metadata).toEqual(data);
  expect(await store.commit(structuredClone(input))).toEqual(first);
  await expect(
    store.commit({
      ...input,
      changes: [create('json', { ...data, ['__proto__']: { text: 'changed' } })],
    }),
  ).rejects.toThrow('reused');
  await expect(
    store.commit({ ...input, metadata: { ...data, ['__proto__']: { text: 'changed' } } }),
  ).rejects.toThrow('reused');
  expect(snapshot.get('json')?.data).toEqual(data);
  store.close();
});

test('declared reads check every node identity and reject stale or invalid expectations atomically', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  await store.commit(request('first', [create('__proto__', { value: 1 })]));
  await store.commit(request('second', [await revise(store, '__proto__', { value: 2 })]));
  const before = await store.snapshot();
  const input = request('derived', [create('derived', { value: 1 })]);
  await expect(
    store.commit({ ...input, expectedReads: JSON.parse('{"__proto__":"first"}') }),
  ).rejects.toThrow('Conflict');
  await expect(
    store.commit({ ...input, expectedReads: JSON.parse('{"__proto__":7}') }),
  ).rejects.toThrow();
  await expect(
    store.commit({ ...input, expectedReads: { ' invalid ': 'second' } }),
  ).rejects.toThrow();
  expect((await store.snapshot()).sequence).toBe(before.sequence);
  expect((await store.snapshot()).get('derived')).toBeUndefined();
  await store.commit({ ...input, expectedReads: JSON.parse('{"__proto__":"second"}') });
  expect((await store.snapshot()).get('derived')?.data).toEqual({ value: 1 });
  store.close();
});

test('invalid JSON content is rejected without publishing a node or transaction', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  const before = await store.snapshot();
  for (const data of [
    { value: Number.POSITIVE_INFINITY },
    { value: undefined },
    { value: new Date() },
    [],
  ]) {
    // External producers may supply values outside the typed JSON contract.
    // biome-ignore lint/performance/noAwaitInLoops: each rejection must leave the same snapshot.
    await expect(
      store.commit(request('invalid-json', [create('invalid', data as never)])),
    ).rejects.toThrow();
  }
  expect((await store.snapshot()).sequence).toBe(before.sequence);
  expect((await store.snapshot()).get('invalid')).toBeUndefined();
  store.close();
});

test('exact live containers traverse current child placements after identity deletion', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  const historical = await store.snapshot();
  const page = historical.get('page')!;
  await store.commit(
    request('edit', [await revise(store, 'evidence', { text: 'Current evidence' })]),
  );
  await store.commit(
    request('move', [
      { ...(await revise(store, 'appearance', { kind: 'appearance' })), placement: null },
    ]),
  );
  await store.commit(
    request('new-child', [
      {
        ...create('new-child', { text: 'Added later' }, 'page'),
        placement: { parent: 'page', order: 'b' },
        connection: { source: { node: 'page' }, target: { node: 'evidence' } },
      },
    ]),
  );
  await store.commit(request('delete', [await revise(store, 'page', null)]));
  const current = await store.snapshot();
  expect((await nodeClosure(store, page.key)).map((version) => version.key.node)).toEqual([
    'page',
    'new-child',
    'evidence',
  ]);
  expect(
    (await nodeClosure(store, page.key)).find((version) => version.key.node === 'evidence')?.data,
  ).toEqual({ text: 'Current evidence' });
  expect(current.children(page.key).map((version) => version.key.node)).toEqual(['new-child']);
  expect(current.children('page')).toEqual([]);
  expect(current.children(current.get('page')!.key)).toEqual([]);
  expect(historical.children(current.get('page')!.key)).toEqual([]);
  expect(current.children({ node: 'page', transaction: 'edit' })).toEqual([]);
  expect(current.children({ node: 'missing', transaction: 'seed' })).toEqual([]);
  expect(await nodeClosure(store, { node: 'page' })).toEqual([]);
  expect(
    (await nodeClosure(store, page.key, historical.sequence)).map((version) => version.key.node),
  ).toEqual(['page', 'appearance', 'evidence']);
  expect(historical.get('page')).toBe(page);
  expect(historical.children('page').map((version) => version.key.node)).toEqual(['appearance']);
  store.close();
});

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
