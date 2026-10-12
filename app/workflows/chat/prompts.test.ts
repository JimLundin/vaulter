import { expect, test } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';
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
  const options = {
    nodes,
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
