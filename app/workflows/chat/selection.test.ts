import { transactionOptionsFixture } from '../../vault/transactions/fixtures.test-support.ts';
import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';
import type { NodeStore } from '../../vault/nodes/store.ts';
import { createNodeConversation } from './node-conversation.ts';
import { createTranscription } from './transcription.ts';

async function fixture() {
  const store = memoryNodeBackend();
  await seed(store);
  await store.commit(
    request(
      'saved',
      ['first', 'second'].flatMap((node) => [
        create(node, { kind: 'conversation', title: node, createdAt: '2026-10-10T12:00:00Z' }),
        create(`${node}-exchange`, { kind: 'exchange', startedAt: '2026-10-10T12:00:00Z' }, node),
        create(
          `${node}-message`,
          { kind: 'message', role: 'user', at: '2026-10-10T12:00:00Z', text: `${node} message` },
          `${node}-exchange`,
        ),
      ]),
    ),
  );
  const reads: { release: () => void }[] = [];
  let hold = false;
  const nodes: NodeStore = {
    ...store,
    snapshot: async (sequence) => {
      if (hold) {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        reads.push({ release });
        await gate;
      }
      return store.snapshot(sequence);
    },
  };
  const options = {
    nodes,
    user: 'user',
    agent: 'user',
    provider: 'fictional',
    selectedModel: '',
    instructions: '',
    availability: 'Configure a model before sending.',
    model: async () => {
      throw new Error('Reading must not execute');
    },
  };
  const chat = createNodeConversation(transactionOptionsFixture(options));
  return {
    store,
    chat,
    options,
    reads,
    hold: () => {
      hold = true;
    },
  };
}

test('latest eligible Open wins and preserves the shared draft when earlier reads finish late', async () => {
  const { chat, hold, reads } = await fixture();
  chat.setDraft('An unfinished thought');
  hold();
  const earlier = chat.open('first');
  const later = chat.open('second');
  reads[1]!.release();
  expect(await later).toMatchObject({ status: 'selected', conversation: 'second' });
  reads[0]!.release();
  expect(await earlier).toEqual({ status: 'superseded' });
  expect(chat.snapshot()).toMatchObject({ draft: 'An unfinished thought', selection: {} });
  expect(chat.conversation()).toBe('second');
  expect(chat.snapshot().turns[0]?.parts).toEqual([{ kind: 'text', text: 'second message' }]);
  chat.dispose();
});

test('admitted New invalidates pending Open and creates no empty saved conversation', async () => {
  const { chat, hold, reads } = await fixture();
  const original = chat.conversation();
  chat.setDraft('Old draft');
  hold();
  const opening = chat.open('first');
  expect(chat.newChat()).toMatchObject({ status: 'selected' });
  const fresh = chat.conversation();
  expect(fresh).not.toBe(original);
  reads[0]!.release();
  expect(await opening).toEqual({ status: 'superseded' });
  expect(chat.conversation()).toBe(fresh);
  expect(chat.snapshot()).toMatchObject({ draft: '', turns: [] });
  const close = chat.watchRecords();
  reads[1]!.release();
  await vi.waitFor(() =>
    expect(chat.snapshot().records.chats?.map((item) => item.node)).toEqual(['first', 'second']),
  );
  close();
  chat.dispose();
});

test('explicit Open supersedes startup restoration during its history read', async () => {
  const { chat, hold, reads } = await fixture();
  hold();
  const restoration = chat.restore('first');
  const explicit = chat.open('second');
  reads[1]!.release();
  await explicit;
  reads[0]!.release();
  expect(await restoration).toEqual({ status: 'superseded' });
  expect(await chat.restore()).toEqual({ status: 'superseded' });
  expect(chat.conversation()).toBe('second');
  chat.dispose();
});

test('startup without a requested conversation neither reads history nor selects a saved chat', async () => {
  const { chat, hold, reads } = await fixture();
  const selected = chat.conversation();
  hold();
  expect(await chat.restore()).toEqual({ status: 'selected', conversation: selected });
  expect(reads).toHaveLength(0);
  expect(chat.conversation()).toBe(selected);
  expect(chat.snapshot()).toMatchObject({ turns: [], selection: {} });
  chat.dispose();
});

test('failed Open retains selected history and draft and presents its own error', async () => {
  const { chat } = await fixture();
  await chat.open('first');
  chat.setDraft('Retain this');
  expect(await chat.open('missing')).toMatchObject({ status: 'failed' });
  expect(chat.conversation()).toBe('first');
  expect(chat.snapshot().draft).toBe('Retain this');
  expect(chat.snapshot().selection.error).toBeTruthy();
  expect(chat.snapshot().turns[0]?.parts).toEqual([{ kind: 'text', text: 'first message' }]);
  chat.dispose();
});

test('an ineligible Open does not cancel an eligible read and blocked selection preserves capture and draft', async () => {
  const { chat, options, hold, reads } = await fixture();
  const voice = createTranscription(async () => ({ close: () => {}, finish: async () => 'Final' }));
  chat.updateOptions(transactionOptionsFixture({ ...options, transcription: voice }));
  chat.setDraft('Prefix');
  hold();
  const valid = chat.open('first');
  await chat.captureAction();
  const selected = chat.conversation();
  expect(await chat.open('second')).toMatchObject({
    status: 'blocked',
    reason: expect.stringContaining('recording'),
  });
  expect(chat.newChat()).toMatchObject({ status: 'blocked' });
  expect(chat.conversation()).toBe(selected);
  expect(chat.snapshot()).toMatchObject({
    draft: 'Prefix',
    capture: { phase: 'listening' },
    selection: { pending: { conversation: 'first' } },
  });
  await chat.captureAction();
  reads[0]!.release();
  expect(await valid).toMatchObject({ status: 'selected', conversation: 'first' });
  expect(chat.snapshot().draft).toBe('Prefix Final');
  chat.dispose();
  voice.dispose();
});

test('selection rechecks capture after a read without changing the selected task', async () => {
  const { chat, options, hold, reads } = await fixture();
  const voice = createTranscription(async () => ({ close: () => {}, finish: async () => 'Final' }));
  chat.updateOptions(transactionOptionsFixture({ ...options, transcription: voice }));
  chat.setDraft('Prefix');
  hold();
  const opening = chat.open('first');
  await chat.captureAction();
  const original = chat.conversation();
  reads[0]!.release();
  expect(await opening).toMatchObject({ status: 'blocked' });
  expect(chat.conversation()).toBe(original);
  expect(chat.snapshot()).toMatchObject({
    draft: 'Prefix',
    turns: [],
    capture: { phase: 'listening' },
  });
  chat.dispose();
  voice.dispose();
});

test('request ownership invalidates selection reads before model preparation finishes', async () => {
  const { chat, options, hold, reads } = await fixture();
  chat.updateOptions(
    transactionOptionsFixture({ ...options, selectedModel: 'fictional', availability: undefined }),
  );
  chat.setDraft('Owned request');
  hold();
  const opening = chat.open('first');
  const current = chat.conversation();
  const submission = chat.prepareSubmission();
  expect(submission.status).toBe('owned');
  reads[0]!.release();
  expect(await opening).toEqual({ status: 'superseded' });
  expect(chat.conversation()).toBe(current);
  expect(chat.snapshot().submission?.text).toBe('Owned request');
  chat.dispose();
});

test('disposal invalidates held read completion and retains the last closed snapshot', async () => {
  const { chat, hold, reads } = await fixture();
  hold();
  const opening = chat.open('first');
  const before = chat.snapshot();
  chat.dispose();
  reads[0]!.release();
  expect(await opening).toEqual({ status: 'superseded' });
  expect(chat.snapshot()).toBe(before);
});

test('eligible Open revokes an earlier review before its read finishes', async () => {
  const { chat, options, hold, reads } = await fixture();
  chat.updateOptions(
    transactionOptionsFixture({
      ...options,
      selectedModel: 'fictional',
      availability: undefined,
      stagedChanges: () => [{ path: 'draft.md', before: 'Old', text: 'Changed' }],
    }),
  );
  chat.setDraft('Review this');
  const review = chat.prepareSubmission();
  if (review.status !== 'review') throw new Error('Expected review');
  hold();
  const opening = chat.open('first');
  expect(chat.snapshot().review).toBeUndefined();
  expect(chat.confirmReview(review.id).status).toBe('blocked');
  expect(chat.snapshot().draft).toBe('Review this');
  reads[0]!.release();
  expect((await opening).status).toBe('selected');
  chat.dispose();
});

test('capture-blocked selection keeps an earlier review available after recording finishes', async () => {
  const { chat, options } = await fixture();
  const voice = createTranscription(async () => ({ close: () => {}, finish: async () => 'Final' }));
  chat.updateOptions(
    transactionOptionsFixture({
      ...options,
      selectedModel: 'fictional',
      availability: undefined,
      transcription: voice,
      stagedChanges: () => [{ path: 'draft.md', before: 'Old', text: 'Changed' }],
    }),
  );
  chat.setDraft('Review this');
  const review = chat.prepareSubmission();
  if (review.status !== 'review') throw new Error('Expected review');
  await chat.captureAction();
  expect((await chat.open('first')).status).toBe('blocked');
  expect(chat.newChat().status).toBe('blocked');
  expect(chat.snapshot().review?.id).toBe(review.id);
  await chat.captureAction();
  expect(chat.snapshot().review?.id).toBe(review.id);
  expect(chat.snapshot().reviewAvailability.allowed).toBe(true);
  chat.dispose();
  voice.dispose();
});

test('a review begun during a pending Open cannot remain attached to newly selected history', async () => {
  const { chat, options, hold, reads } = await fixture();
  chat.updateOptions(
    transactionOptionsFixture({
      ...options,
      selectedModel: 'fictional',
      availability: undefined,
      stagedChanges: () => [{ path: 'draft.md', before: 'Old', text: 'Changed' }],
    }),
  );
  chat.setDraft('Retain my draft');
  hold();
  const opening = chat.open('first');
  const review = chat.prepareSubmission();
  if (review.status !== 'review') throw new Error('Expected review');
  reads[0]!.release();
  expect((await opening).status).toBe('selected');
  expect(chat.snapshot().review).toBeUndefined();
  expect(chat.confirmReview(review.id).status).toBe('blocked');
  expect(chat.snapshot().draft).toBe('Retain my draft');
  chat.dispose();
});
