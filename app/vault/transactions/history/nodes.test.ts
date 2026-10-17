import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { create, request, revise, seed } from '@/vault/nodes/fixtures.test-support.ts';
import { nodeHistory, prepareContentUndo, transactionHistory } from './nodes.ts';
import { createTransactionSession } from '@/vault/transactions/lifetime.ts';
import { nodeOperations } from '@/vault/nodes/operations.ts';
import type { NodeCommit, NodeDifference } from '@/vault/nodes/store.ts';

const canUndo = ({ before, after }: NodeDifference) =>
  [before, after].every((version) => version?.data == null || version.data.kind === 'paragraph');

test('History coalesces compensation preparation and retries exact accepted work after adapter replacement', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  await store.commit(
    request('edit', [await revise(store, 'evidence', { kind: 'paragraph', text: 'Changed' })]),
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const changes = vi.fn(async (transaction: string) => {
    await held;
    return store.changes(transaction);
  });
  const attempts: NodeCommit[] = [];
  const session = createTransactionSession({
    ...store,
    changes,
    commit: async (request) => {
      attempts.push(request);
      await store.commit(request);
      throw new Error('Response lost');
    },
  });
  const history = transactionHistory(session.nodes, { recordedBy: 'user', canUndo });
  const first = history.compensate('edit');
  expect(history.compensate('edit')).toBe(first);
  release();
  await expect(first).rejects.toThrow('Response lost');
  await session.replace({
    ...store,
    changes,
    commit: (request) => {
      attempts.push(request);
      return store.commit(request);
    },
  });
  const recovered = await history.compensate('edit');
  expect(recovered.undoOf).toBe('edit');
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toBe(attempts[0]);
  expect(changes).toHaveBeenCalledOnce();
  expect((await store.history()).filter(({ undoOf }) => undoOf === 'edit')).toHaveLength(1);
  expect((await store.snapshot()).get('evidence')?.data?.text).toBe('Keep mornings free.');
  session.close();
  await session.drain();
  store.close();
});

test('History resolves attribution at transaction cutoffs and retains complete structural differences', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  const moved = await revise(store, 'appearance', { kind: 'appearance', annotation: 'Selected' });
  await store.commit({
    ...request('move', [{ ...moved, placement: null }]),
    kind: nodeOperations.move,
    origin: 'page',
    metadata: { reason: 'Review', future: { retained: true } },
  });
  await store.commit(
    request('rename-author', [await revise(store, 'user', { kind: 'actor', name: 'New name' })]),
  );
  const entries = await nodeHistory(store, { kinds: [nodeOperations.move] });
  expect(entries).toHaveLength(1);
  expect(entries[0].author.data?.name).toBe('Fictional user');
  expect(entries[0].origin?.key).toEqual({ node: 'page', transaction: 'seed' });
  expect(entries[0].transaction.metadata).toEqual({ reason: 'Review', future: { retained: true } });
  expect(entries[0].differences[0].before?.placement).toEqual({ parent: 'page', order: 'a' });
  expect(entries[0].differences[0].after.placement).toBeNull();
  const page = await nodeHistory(store, { limit: 1 });
  expect(page[0].transaction.id).toBe('rename-author');
  expect(
    (await nodeHistory(store, { beforeSequence: page[0].transaction.sequence, limit: 1 }))[0]
      .transaction.id,
  ).toBe('move');
  store.close();
});

test('content undo appends guarded compensation while retaining transcript and exact evidence', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  await store.commit(
    request('send', [
      create('chat', { kind: 'conversation', title: 'Studio mornings' }),
      create('message', { kind: 'message', role: 'user', text: 'Studio mornings' }, 'chat'),
    ]),
  );
  const transcript = (await store.snapshot()).get('message');
  const original = (await store.snapshot()).get('evidence')!;
  await store.commit(
    request('edit', [await revise(store, 'evidence', { kind: 'paragraph', text: 'Changed' })]),
  );
  const undo = await prepareContentUndo(store, {
    transaction: 'edit',
    recordedBy: 'user',
    id: 'undo',
    canUndo,
  });
  const accepted = await store.commit(undo);
  expect(await store.commit(undo)).toEqual(accepted);
  expect(accepted.undoOf).toBe('edit');
  expect((await store.snapshot()).get('evidence')?.data).toEqual(original.data);
  expect((await store.snapshot()).resolve(original.key)).toBe(original);
  expect((await store.snapshot()).get('message')).toBe(transcript);
  await expect(
    prepareContentUndo(store, {
      transaction: 'send',
      recordedBy: 'user',
      id: 'erase-transcript',
      canUndo,
    }),
  ).rejects.toThrow('cannot be undone');
  const stale = await prepareContentUndo(store, {
    transaction: 'undo',
    recordedBy: 'user',
    id: 'stale',
    canUndo,
  });
  await store.commit(
    request('new-edit', [await revise(store, 'evidence', { kind: 'paragraph', text: 'Latest' })]),
  );
  await expect(store.commit(stale)).rejects.toThrow('Conflict');
  expect((await store.snapshot()).get('evidence')?.data?.text).toBe('Latest');
  store.close();
});

test('content undo restores deletion and refuses mixed content and audit transactions atomically', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  await store.commit(request('delete', [await revise(store, 'evidence', null)]));
  const [entry] = await nodeHistory(store, { limit: 1 });
  expect(entry.differences[0].after.data).toBeNull();
  await store.commit(
    await prepareContentUndo(store, {
      transaction: 'delete',
      recordedBy: 'user',
      id: 'restore',
      canUndo,
    }),
  );
  expect((await store.snapshot()).get('evidence')?.data?.text).toBe('Keep mornings free.');
  await store.commit(
    request('mixed', [
      await revise(store, 'evidence', { kind: 'paragraph', text: 'Mixed' }),
      create('audit', { kind: 'agentRun', status: 'running' }),
    ]),
  );
  await expect(
    prepareContentUndo(store, {
      transaction: 'mixed',
      recordedBy: 'user',
      id: 'undo-mixed',
      canUndo,
    }),
  ).rejects.toThrow('cannot be undone');
  expect((await store.snapshot()).get('evidence')?.data?.text).toBe('Mixed');
  store.close();
});
