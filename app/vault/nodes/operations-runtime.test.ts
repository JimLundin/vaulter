import { expect, test } from 'vitest';
import { memoryNodeBackend } from './memory.ts';
import { create, request, seed, revise } from './fixtures.test-support.ts';
import { nodeClosure } from './operations-runtime.ts';

test('closure includes shared content once when several appearances reach it', async () => {
  const store = memoryNodeBackend();
  try {
    await seed(store);
    await store.commit(
      request('another-appearance', [
        {
          ...create('second-appearance', { kind: 'appearance' }, 'page'),
          placement: { parent: 'page', order: 'b' },
          connection: { source: { node: 'page' }, target: { node: 'evidence' } },
        },
      ]),
    );
    const closure = await nodeClosure(store, { node: 'page' });
    expect(closure.map((version) => version.key.node).sort()).toEqual([
      'appearance',
      'evidence',
      'page',
      'second-appearance',
    ]);
  } finally {
    store.close();
  }
});

test('closure retains exact and current versions of shared content without repeating either', async () => {
  const store = memoryNodeBackend();
  try {
    await seed(store);
    await store.commit(
      request('edit', [
        await revise(store, 'evidence', { text: 'Current evidence' }),
        {
          ...create('citation', { kind: 'citation' }, 'page'),
          connection: {
            source: { node: 'page' },
            target: { node: 'evidence', transaction: 'seed' },
          },
        },
      ]),
    );
    const closure = await nodeClosure(store, { node: 'page' });
    expect(
      closure
        .filter((version) => version.key.node === 'evidence')
        .map((version) => ({ transaction: version.key.transaction, data: version.data }))
        .sort((left, right) => left.transaction.localeCompare(right.transaction)),
    ).toEqual([
      { transaction: 'edit', data: { text: 'Current evidence' } },
      { transaction: 'seed', data: { kind: 'paragraph', text: 'Keep mornings free.' } },
    ]);
    expect(closure).toHaveLength(5);
  } finally {
    store.close();
  }
});

test('recursive connection targets terminate with each reachable version included once', async () => {
  const store = memoryNodeBackend();
  try {
    await seed(store);
    await store.commit(
      request('recursive', [
        {
          ...(await revise(store, 'evidence', { text: 'Links back to the page' })),
          connection: { source: { node: 'evidence' }, target: { node: 'page' } },
        },
      ]),
    );
    const snapshot = await store.snapshot();
    let remaining = 20;
    // A broken visited set loops synchronously, so a timer cannot stop it. Bound the
    // fixture's reads to fail safely instead of hanging the test worker.
    const bounded = {
      ...store,
      snapshot: async () => ({
        ...snapshot,
        resolve: (address: Parameters<typeof snapshot.resolve>[0]) => {
          if (--remaining < 0) throw new Error('Recursive closure did not terminate');
          return snapshot.resolve(address);
        },
      }),
    };
    expect(
      (await nodeClosure(bounded, { node: 'page' })).map((version) => version.key.node),
    ).toEqual(['page', 'appearance', 'evidence']);
  } finally {
    store.close();
  }
});
