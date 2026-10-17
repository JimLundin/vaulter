import { chatFixture } from './fixtures.test-support.ts';
import { expect, test } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { createConversation, type ConversationOptions } from './conversation.ts';
import { createTranscription, type TranscriptionEvents } from '@/transcription.ts';

async function fixture(overrides: Partial<ConversationOptions> = {}) {
  const { db, options: base } = await chatFixture();
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
  const options: ConversationOptions = {
    ...base,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    model: async () => model,
    suggestions: async () => [],
    ...overrides,
  };
  return { db, model, options };
}

test('Chat interprets Ask once and preserves later typing when the same prompt is presented again', async () => {
  const { db, model, options } = await fixture();
  const chat = createConversation(options);
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
    await db[Symbol.asyncDispose]();
  }
});

test('unavailable Ask and edit prompts safely replace the editable draft without delayed execution', async () => {
  const { db, model, options } = await fixture({ availability: 'Model unavailable' });
  const chat = createConversation(options);
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
    await db[Symbol.asyncDispose]();
  }
});

test('capture retains each supplied prompt without replacing spoken words and explicit Use rechecks permission', async () => {
  let callbacks!: TranscriptionEvents;
  const transcription = createTranscription(async (next) => {
    callbacks = next;
    return { finish: async () => 'spoken words', close: () => {} };
  });
  const { db, model, options } = await fixture({ transcription });
  const chat = createConversation(options);
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
    await db[Symbol.asyncDispose]();
  }
});

test('a retained prompt stays associated with the single dialogue after a rejected New action', async () => {
  const transcription = createTranscription(async () => ({ finish: async () => '', close() {} }));
  const { db, model, options } = await fixture({ transcription });
  const chat = createConversation(options);
  try {
    await chat.captureAction();
    chat.receivePrompt({ n: 1, send: true, text: 'Keep in this dialogue' });
    await chat.captureAction();
    expect(chat.newChat()).toMatchObject({ status: 'blocked' });
    const sent = chat.applyPrompt(1);
    if (sent.status !== 'owned') throw new Error('Expected retained prompt submission');
    await sent.done;
    expect(chat.snapshot().submission?.text).toBe('Keep in this dialogue');
    expect(model.doStreamCalls).toHaveLength(1);
  } finally {
    chat.dispose();
    transcription.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('explicit Use submits a retained Ask once and removes the retained text after handoff', async () => {
  const transcription = createTranscription(async () => ({ finish: async () => '', close() {} }));
  const { db, model, options } = await fixture({ transcription });
  const chat = createConversation(options);
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
    await db[Symbol.asyncDispose]();
  }
});

test('suggestions arriving after an admitted Open cannot publish into the changing conversation', async () => {
  let releaseSuggestions!: (suggestions: string[]) => void;
  const { db, options } = await fixture({
    suggestions: () =>
      new Promise((resolve) => {
        releaseSuggestions = resolve;
      }),
  });
  let releaseRead!: () => void;
  const reader: ConversationOptions['backend'] = (value) => {
    const backend = options.backend(value);
    return {
      ...backend,
      messages: async (conversation) => {
        await new Promise<void>((resolve) => {
          releaseRead = resolve;
        });
        return backend.messages(conversation);
      },
    };
  };
  const chat = createConversation({ ...options, backend: reader });
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
    await db[Symbol.asyncDispose]();
  }
});

test('an admitted Open removes displayed suggestions before the selected conversation read completes', async () => {
  const { db, options } = await fixture({ suggestions: async () => ['Old suggestion'] });
  let releaseRead!: () => void;
  const reader: ConversationOptions['backend'] = (value) => {
    const backend = options.backend(value);
    return {
      ...backend,
      messages: async (conversation) => {
        await new Promise<void>((resolve) => {
          releaseRead = resolve;
        });
        return backend.messages(conversation);
      },
    };
  };
  const chat = createConversation({ ...options, backend: reader });
  try {
    await chat.suggest();
    expect(chat.snapshot().suggestions).toEqual(['Old suggestion']);
    const opening = chat.open('missing');
    expect(chat.snapshot().suggestions).toEqual([]);
    releaseRead();
    await opening;
  } finally {
    chat.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('busy Ask safely becomes an editable draft and never executes when the earlier request finishes', async () => {
  const { db, model, options } = await fixture();
  const chat = createConversation(options);
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
    await db[Symbol.asyncDispose]();
  }
});
