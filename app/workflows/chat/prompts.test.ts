import { transactionFixture } from '../../vault/transactions/fixtures.test-support.ts';
import { expect, test } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';
import type { NodeStore } from '../../vault/nodes/store.ts';
import { createNodeConversation, type NodeConversationOptions } from './node-conversation.ts';
import { createTranscription, type TranscriptionEvents } from './transcription.ts';

async function fixture(overrides: Partial<NodeConversationOptions> = {}) {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent', name: 'Fictional' })]));
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'reply' },
        { type: 'text-delta', id: 'reply', delta: 'Answer.' },
        { type: 'text-end', id: 'reply' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
        },
      ]),
    }),
  });
  const options: NodeConversationOptions = {
    nodes: transactionFixture(nodes),
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: async () => model,
    suggestions: async () => [],
    ...overrides,
  };
  return { nodes, model, options };
}

test('Chat interprets Ask once and preserves later typing when the same prompt is presented again', async () => {
  const { nodes, model, options } = await fixture();
  const chat = createNodeConversation(options);
  try {
    chat.setDraft('Unrelated draft');
    const prompt = { n: 1, send: true, text: 'Ask once' };
    const outcome = chat.receivePrompt(prompt);
    expect(outcome.status).toBe('owned');
    if (outcome.status !== 'owned') throw new Error('Expected owned Ask');
    chat.setDraft('Later manual text');
    expect(chat.receivePrompt(prompt)).toEqual({ status: 'ignored' });
    await outcome.done;
    expect(chat.snapshot().draft).toBe('Later manual text');
    expect(chat.snapshot().turns[0]?.parts).toEqual([{ kind: 'text', text: 'Ask once' }]);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(chat.snapshot().prompts).toEqual([]);
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('unavailable Ask and edit prompts safely replace the editable draft without delayed execution', async () => {
  const { nodes, model, options } = await fixture({ availability: 'Model unavailable' });
  const chat = createNodeConversation(options);
  try {
    chat.setDraft('Original');
    expect(chat.receivePrompt({ n: 1, send: true, text: 'Ask when ready' })).toEqual({
      status: 'edited',
    });
    expect(chat.snapshot().draft).toBe('Ask when ready');
    chat.updateOptions({ ...options, availability: undefined });
    await Promise.resolve();
    expect(model.doStreamCalls).toHaveLength(0);
    expect(chat.receivePrompt({ n: 2, send: false, text: 'Edit only' })).toEqual({
      status: 'edited',
    });
    expect(chat.snapshot().draft).toBe('Edit only');
    expect(model.doStreamCalls).toHaveLength(0);
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('capture retains each supplied prompt without replacing spoken words and explicit Use rechecks permission', async () => {
  let callbacks!: TranscriptionEvents;
  const transcription = createTranscription(async (next) => {
    callbacks = next;
    return { finish: async () => 'spoken words', close: () => {} };
  });
  const { nodes, model, options } = await fixture({ transcription });
  const chat = createNodeConversation(options);
  try {
    chat.setDraft('Existing');
    await chat.captureAction();
    callbacks.text('spoken words');
    const before = chat.snapshot().capture;
    expect(chat.receivePrompt({ n: 1, send: true, text: 'Blocked Ask' })).toMatchObject({
      status: 'blocked',
      reason: expect.stringMatching(/recording/),
    });
    chat.receivePrompt({ n: 2, send: false, text: 'Blocked edit' });
    expect(chat.snapshot().draft).toBe('Existing spoken words');
    expect(chat.snapshot().capture).toEqual(before);
    expect(chat.snapshot().prompts.map(({ text }) => text)).toEqual([
      'Blocked Ask',
      'Blocked edit',
    ]);
    expect(chat.applyPrompt(1)).toMatchObject({ status: 'blocked' });
    expect(chat.snapshot().draft).toBe('Existing spoken words');
    transcription.clear();
    await Promise.resolve();
    expect(chat.snapshot().prompts).toHaveLength(2);
    expect(model.doStreamCalls).toHaveLength(0);
    chat.updateOptions({ ...options, availability: 'Model unavailable' });
    expect(chat.applyPrompt(1)).toEqual({ status: 'edited' });
    expect(chat.snapshot().draft).toBe('Blocked Ask');
    expect(chat.snapshot().prompts.map(({ text }) => text)).toEqual(['Blocked edit']);
    expect(chat.dismissPrompt(2)).toEqual({ status: 'dismissed' });
    expect(chat.snapshot().draft).toBe('Blocked Ask');
    expect(chat.snapshot().prompts).toEqual([]);
    expect(model.doStreamCalls).toHaveLength(0);
  } finally {
    chat.dispose();
    transcription.dispose();
    nodes.close();
  }
});

test('review blocks Ask, edit prompts and suggestions until explicit Use without changing the review or newer draft', async () => {
  const { nodes, model, options } = await fixture({
    stagedChanges: () => [{ path: 'Thought.md', before: 'Old', text: 'New' }],
  });
  const chat = createNodeConversation(options);
  try {
    chat.setDraft('Reviewed message');
    const review = chat.prepareSubmission();
    expect(review.status).toBe('review');
    chat.setDraft('Newer draft');
    chat.receivePrompt({ n: 1, send: true, text: 'Ask after review' });
    chat.receivePrompt({ n: 2, send: false, text: 'Edit after review' });
    expect(chat.editDraft('Suggested text')).toMatchObject({ status: 'blocked' });
    expect(chat.snapshot().review).toBe(review);
    expect(chat.snapshot().draft).toBe('Newer draft');
    expect(chat.snapshot().prompts.map(({ text }) => text)).toEqual([
      'Ask after review',
      'Edit after review',
      'Suggested text',
    ]);
    chat.cancelReview();
    await Promise.resolve();
    expect(model.doStreamCalls).toHaveLength(0);
    expect(chat.snapshot().draft).toBe('Newer draft');
    const used = chat.applyPrompt(1);
    expect(used.status).toBe('review');
    expect(chat.snapshot().review?.intent.text).toBe('Ask after review');
    expect(chat.snapshot().draft).toBe('Newer draft');
    expect(chat.snapshot().prompts.map(({ text }) => text)).toEqual([
      'Edit after review',
      'Suggested text',
    ]);
    expect(model.doStreamCalls).toHaveLength(0);
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('a claimed prompt survives selection and requires another explicit Use after acknowledging the changed conversation', async () => {
  const { nodes, model, options } = await fixture({
    stagedChanges: () => [{ path: 'Thought.md', before: 'Old', text: 'New' }],
  });
  const chat = createNodeConversation(options);
  try {
    chat.setDraft('Reviewed text');
    chat.prepareSubmission();
    chat.receivePrompt({ n: 1, send: true, text: 'Keep across selection' });
    chat.newChat();
    expect(chat.snapshot().prompts[0]?.reason).toMatch(/Conversation changed/);
    expect(chat.applyPrompt(1)).toMatchObject({
      status: 'blocked',
      reason: expect.stringMatching(/use again/),
    });
    expect(chat.snapshot().review).toBeUndefined();
    expect(model.doStreamCalls).toHaveLength(0);
    expect(chat.applyPrompt(1).status).toBe('review');
    expect(chat.snapshot().review?.intent.text).toBe('Keep across selection');
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('explicit Use submits a retained Ask once and removes the retained text after handoff', async () => {
  const transcription = createTranscription(async () => ({ finish: async () => '', close() {} }));
  const { nodes, model, options } = await fixture({ transcription });
  const chat = createNodeConversation(options);
  try {
    await chat.captureAction();
    chat.receivePrompt({ n: 1, send: true, text: 'Use this Ask' });
    transcription.clear();
    const outcome = chat.applyPrompt(1);
    expect(outcome.status).toBe('owned');
    if (outcome.status !== 'owned') throw new Error('Expected owned Ask');
    expect(chat.snapshot().prompts).toEqual([]);
    await outcome.done;
    expect(chat.applyPrompt(1).status).toBe('blocked');
    expect(chat.snapshot().turns[0]?.parts).toEqual([{ kind: 'text', text: 'Use this Ask' }]);
    expect(model.doStreamCalls).toHaveLength(1);
  } finally {
    chat.dispose();
    transcription.dispose();
    nodes.close();
  }
});

test('suggestions arriving after an admitted Open cannot publish into the changing conversation', async () => {
  let releaseSuggestions!: (suggestions: string[]) => void;
  const { nodes, options } = await fixture({
    suggestions: () =>
      new Promise((resolve) => {
        releaseSuggestions = resolve;
      }),
  });
  let releaseRead!: () => void;
  const reader: NodeStore = {
    ...nodes,
    snapshot: async (sequence) => {
      await new Promise<void>((resolve) => {
        releaseRead = resolve;
      });
      return nodes.snapshot(sequence);
    },
  };
  const chat = createNodeConversation({ ...options, nodes: transactionFixture(reader) });
  try {
    const suggesting = chat.suggest();
    const opening = chat.open('missing');
    releaseSuggestions(['Text for the old conversation']);
    await suggesting;
    expect(chat.snapshot().suggestions).toEqual([]);
    releaseRead();
    await opening;
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('an admitted Open removes displayed suggestions before the selected conversation read completes', async () => {
  const { nodes, options } = await fixture({ suggestions: async () => ['Old suggestion'] });
  let releaseRead!: () => void;
  const reader: NodeStore = {
    ...nodes,
    snapshot: async (sequence) => {
      await new Promise<void>((resolve) => {
        releaseRead = resolve;
      });
      return nodes.snapshot(sequence);
    },
  };
  const chat = createNodeConversation({ ...options, nodes: transactionFixture(reader) });
  try {
    await chat.suggest();
    expect(chat.snapshot().suggestions).toEqual(['Old suggestion']);
    const opening = chat.open('missing');
    expect(chat.snapshot().suggestions).toEqual([]);
    releaseRead();
    await opening;
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('busy Ask safely becomes an editable draft and never executes when the earlier request finishes', async () => {
  const { nodes, model, options } = await fixture();
  const chat = createNodeConversation(options);
  try {
    const first = chat.prepareSubmission({ text: 'Already running' });
    if (first.status !== 'owned') throw new Error('Expected owned request');
    expect(chat.receivePrompt({ n: 1, send: true, text: 'Ask later if I send it' })).toEqual({
      status: 'edited',
    });
    await first.done;
    expect(chat.snapshot().draft).toBe('Ask later if I send it');
    expect(chat.snapshot().prompts).toEqual([]);
    expect(chat.snapshot().turns.filter(({ role }) => role === 'user')).toHaveLength(1);
    expect(model.doStreamCalls).toHaveLength(1);
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('a prompt claimed during a pending Open detects its later selected identity change', async () => {
  const { nodes, model, options } = await fixture({
    stagedChanges: () => [{ path: 'Review.md', before: 'Old', text: 'New' }],
  });
  await nodes.commit(
    request('saved', [
      create('saved-chat', {
        kind: 'conversation',
        title: 'Saved',
        createdAt: '2026-10-10T12:00:00Z',
      }),
    ]),
  );
  let releaseRead!: () => void;
  const reader: NodeStore = {
    ...nodes,
    snapshot: async (sequence) => {
      await new Promise<void>((resolve) => {
        releaseRead = resolve;
      });
      return nodes.snapshot(sequence);
    },
  };
  const chat = createNodeConversation({ ...options, nodes: transactionFixture(reader) });
  try {
    const opening = chat.open('saved-chat');
    chat.setDraft('Reviewed while opening');
    chat.prepareSubmission();
    chat.receivePrompt({ n: 1, send: true, text: 'Keep this pending text' });
    releaseRead();
    expect(await opening).toMatchObject({ status: 'selected', conversation: 'saved-chat' });
    expect(chat.applyPrompt(1)).toMatchObject({
      status: 'blocked',
      reason: expect.stringMatching(/use again/),
    });
    expect(chat.snapshot().prompts[0]?.text).toBe('Keep this pending text');
    expect(chat.applyPrompt(1).status).toBe('review');
    expect(chat.snapshot().review?.conversation).toBe('saved-chat');
    expect(chat.snapshot().review?.intent.text).toBe('Keep this pending text');
    expect(model.doStreamCalls).toHaveLength(0);
  } finally {
    chat.dispose();
    nodes.close();
  }
});
