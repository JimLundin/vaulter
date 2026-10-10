import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../nodes/memory.ts';
import { create, request, revise, seed } from '../nodes/fixtures.test-support.ts';
import { nodeHistory, prepareContentUndo } from './history.ts';
import { prepareChatSubmission, savedMessages } from './chat-store.ts';
import { nodeOperations } from '../nodes/operations.ts';

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
  const submission = await prepareChatSubmission(store, {
    transaction: 'send',
    conversation: 'chat',
    user: 'user',
    text: 'Studio mornings',
    at: '2026-10-10T12:00:00Z',
    model: 'fictional',
  });
  await store.commit(submission);
  const transcript = await savedMessages(store, 'chat');
  const original = (await store.snapshot()).get('evidence')!;
  await store.commit(
    request('edit', [await revise(store, 'evidence', { kind: 'paragraph', text: 'Changed' })]),
  );
  const undo = await prepareContentUndo(store, {
    transaction: 'edit',
    recordedBy: 'user',
    id: 'undo',
  });
  const accepted = await store.commit(undo);
  expect(await store.commit(undo)).toEqual(accepted);
  expect(accepted.undoOf).toBe('edit');
  expect((await store.snapshot()).get('evidence')?.data).toEqual(original.data);
  expect((await store.snapshot()).resolve(original.key)).toBe(original);
  expect(await savedMessages(store, 'chat')).toEqual(transcript);
  await expect(
    prepareContentUndo(store, { transaction: 'send', recordedBy: 'user', id: 'erase-transcript' }),
  ).rejects.toThrow('transcript');
  const stale = await prepareContentUndo(store, {
    transaction: 'undo',
    recordedBy: 'user',
    id: 'stale',
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
    await prepareContentUndo(store, { transaction: 'delete', recordedBy: 'user', id: 'restore' }),
  );
  expect((await store.snapshot()).get('evidence')?.data?.text).toBe('Keep mornings free.');
  await store.commit(
    request('mixed', [
      await revise(store, 'evidence', { kind: 'paragraph', text: 'Mixed' }),
      create('audit', { kind: 'agentRun', status: 'running' }),
    ]),
  );
  await expect(
    prepareContentUndo(store, { transaction: 'mixed', recordedBy: 'user', id: 'undo-mixed' }),
  ).rejects.toThrow('provenance');
  expect((await store.snapshot()).get('evidence')?.data?.text).toBe('Mixed');
  store.close();
});
