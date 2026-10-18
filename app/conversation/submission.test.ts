import { eavChatFactory } from './eav-backend.ts';
import { controlledChatStorage } from './controller-storage.test-support.ts';
import { chatFixture } from './fixtures.test-support.ts';
import { expect, test, vi } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { createTranscription } from '@/transcription/capture.ts';
import { createConversation, type ConversationOptions } from './conversation.ts';

async function fixture(
  overrides: Partial<ConversationOptions> = {},
  storage?: Parameters<typeof chatFixture>[0],
) {
  const { db, options: base } = await chatFixture(storage);
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'reply' },
        { type: 'text-delta', id: 'reply', delta: 'Retained answer.' },
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

test('Chat owns a request before clearing its source and preserves newer typing through held initial acceptance and no-replay recovery', async () => {
  let accept!: () => void;
  let attempted!: () => void;
  const entered = new Promise<void>((resolve) => {
    attempted = resolve;
  });
  const held = new Promise<void>((resolve) => {
    accept = resolve;
  });
  let failing = true;
  const storage = controlledChatStorage(async (request) => {
    if (failing && request.commit.facts.some((fact) => fact.value === 'chat.exchange')) {
      attempted();
      await held;
      throw new Error('Initial acceptance unavailable');
    }
  });
  const { db, model, options } = await fixture({}, storage);
  const chat = createConversation(options);
  try {
    chat.setDraft('  First request  ');
    const owned = chat.prepareSubmission();
    expect(owned.status).toBe('owned');
    if (owned.status !== 'owned') throw new Error('Expected owned request');
    expect(owned.request).toMatchObject({
      text: 'First request',
    });
    expect(owned.request.id).toBeTruthy();
    expect(chat.snapshot()).toMatchObject({ draft: '', submission: owned.request, busy: true });
    await entered;
    const busyState = chat.snapshot();
    expect(chat.prepareSubmission()).toEqual({
      status: 'blocked',
      reason: 'Wait for the Agent to finish.',
    });
    expect(chat.snapshot()).toMatchObject({
      draft: busyState.draft,
      turns: busyState.turns,
      capture: busyState.capture,
    });
    expect(chat.snapshot().submission).toBe(busyState.submission);

    expect(model.doStreamCalls).toHaveLength(0);
    chat.setDraft('A newer unfinished draft');
    accept();
    await vi.waitFor(() => expect(chat.snapshot().persistenceStage).toBe('initial'));
    expect(chat.snapshot()).toMatchObject({
      draft: 'A newer unfinished draft',
      submission: owned.request,
      persistenceStage: 'initial',
      persistenceError: 'Initial acceptance unavailable',
    });
    expect(chat.snapshot().turns[0]?.parts).toEqual([{ kind: 'text', text: 'First request' }]);
    const recoveryState = chat.snapshot();
    expect(chat.prepareSubmission()).toEqual({
      status: 'blocked',
      reason: 'Resolve the pending recovery before sending.',
    });
    expect(chat.snapshot()).toMatchObject({
      draft: recoveryState.draft,
      turns: recoveryState.turns,
      capture: recoveryState.capture,
    });
    expect(chat.snapshot().submission).toBe(recoveryState.submission);

    failing = false;
    await chat.retrySave();
    await owned.done;
    expect(chat.snapshot().draft).toBe('A newer unfinished draft');
    expect(chat.snapshot().submission?.id).toBe(owned.request.id);
    expect(chat.snapshot().phase).toBe('recorded');
    expect(model.doStreamCalls).toHaveLength(0);
  } finally {
    accept();
    chat.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('request ownership is observable atomically with busy admission, including synchronous subscribers', async () => {
  const { db, options } = await fixture();
  const chat = createConversation(options);
  let second: ReturnType<typeof chat.prepareSubmission> | undefined;
  let attempted = false;
  chat.setDraft('The first request');
  const unsubscribe = chat.subscribe(() => {
    if (!chat.snapshot().submission || attempted) return;
    attempted = true;
    second = chat.prepareSubmission({ text: 'Another request cannot overlap the handoff' });
  });
  try {
    const first = chat.prepareSubmission();
    expect(second).toEqual({ status: 'blocked', reason: 'Wait for the Agent to finish.' });
    if (first.status !== 'owned') throw new Error('Expected owned request');
    await first.done;
    expect(chat.snapshot().turns.filter(({ role }) => role === 'user')).toHaveLength(1);
  } finally {
    unsubscribe();
    chat.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test.each([
  ['blank text', '  \n ', {}, 'Enter a message.'],
  [
    'unavailable saving',
    'Keep this text',
    { availability: 'Vault storage is offline' },
    'Vault storage is offline',
  ],
  [
    'unavailable execution',
    'Keep this text',
    { selectedModel: '' },
    'Select a model before sending.',
  ],
] as const)(
  '%s is denied without changing draft, history, or request state',
  async (_name, text, overrides, reason) => {
    const { db, model, options } = await fixture(overrides);
    const chat = createConversation(options);
    try {
      chat.setDraft(text);
      const before = chat.snapshot();
      expect(chat.snapshot().submissionAvailability).toEqual({ allowed: false, reason });
      expect(chat.prepareSubmission()).toEqual({ status: 'blocked', reason });
      expect(chat.snapshot()).toMatchObject({
        draft: before.draft,
        turns: before.turns,
        capture: before.capture,
      });
      expect(chat.snapshot().submission).toBe(before.submission);

      expect(model.doStreamCalls).toHaveLength(0);
    } finally {
      chat.dispose();
      await db[Symbol.asyncDispose]();
    }
  },
);

test('synchronous handoff failure keeps the source and its revision for a later explicit retry', async () => {
  const { db, model, options } = await fixture();
  const chat = createConversation(options);
  chat.setDraft('Preserve this source');
  const original = chat.snapshot();
  const intent = chat.draftIntent();
  const identity = vi.spyOn(crypto, 'randomUUID').mockImplementationOnce(() => {
    throw new Error('Request identity unavailable');
  });
  try {
    expect(chat.prepareSubmission()).toEqual({
      status: 'blocked',
      reason: 'Request identity unavailable',
    });
    expect(chat.snapshot()).toMatchObject({
      draft: original.draft,
      turns: original.turns,
      capture: original.capture,
    });
    expect(chat.snapshot().submission).toBe(original.submission);

    expect(chat.draftIntent()).toEqual(intent);
    expect(model.doStreamCalls).toHaveLength(0);
    const owned = chat.prepareSubmission();
    if (owned.status !== 'owned') throw new Error('Expected explicit retry to own request');
    await owned.done;
    expect(chat.snapshot().draft).toBe('');
  } finally {
    identity.mockRestore();
    chat.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('asynchronous preparation failure preserves locally owned request text without clearing a newer draft', async () => {
  const { db, model, options } = await fixture();
  const chat = createConversation({
    ...options,
    backend: eavChatFactory(Promise.reject(new Error('Database unavailable'))),
  });
  try {
    chat.setDraft('Owned before the read');
    const outcome = chat.prepareSubmission();
    if (outcome.status !== 'owned') throw new Error('Expected local ownership');
    chat.setDraft('New words during preparation');
    await outcome.done;
    expect(chat.snapshot()).toMatchObject({
      draft: 'New words during preparation',
      submission: outcome.request,
      phase: 'failed',
    });
    expect(chat.snapshot().turns[0]?.parts).toEqual([
      { kind: 'text', text: 'Owned before the read' },
    ]);
    expect(chat.snapshot().turns[1]?.error).toBe('Database unavailable');
    expect(model.doStreamCalls).toHaveLength(0);
    // The failed request was locally retained, never represented as durable acceptance.
    expect(await db.transaction((tx) => tx.entities.exchanges.query({ select: {} }))).toEqual([]);
  } finally {
    chat.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('a completed transcription is a newer source revision than an earlier retained submission intent', async () => {
  const voice = createTranscription(async () => ({
    close: () => undefined,
    finish: async () => 'New spoken words',
  }));
  const { db, options } = await fixture({ transcription: voice });
  const chat = createConversation(options);
  try {
    chat.setDraft('The earlier typed text');
    const earlier = chat.draftIntent();
    await chat.captureAction();
    await chat.captureAction();
    const outcome = chat.prepareSubmission(earlier);
    if (outcome.status !== 'owned') throw new Error('Expected retained text ownership');
    await outcome.done;
    expect(chat.snapshot().draft).toBe('The earlier typed text New spoken words');
  } finally {
    chat.dispose();
    voice.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test.each(['connecting', 'listening', 'finishing'] as const)(
  'active %s capture denies submission without changing draft or recording',
  async (phase) => {
    let connected!: (value: { close: () => void; finish: () => Promise<string> }) => void;
    let finish!: (text: string) => void;
    const voice = createTranscription(
      () =>
        new Promise((resolve) => {
          connected = resolve;
        }),
    );
    const { db, model, options } = await fixture({ transcription: voice });
    const chat = createConversation(options);
    let finishing: Promise<unknown> | undefined;
    try {
      chat.setDraft('Keep typed and spoken input');
      const starting = chat.captureAction();
      if (phase !== 'connecting') {
        connected({
          close: () => undefined,
          finish: () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        });
        await starting;
        if (phase === 'finishing') finishing = chat.captureAction();
      }
      const before = chat.snapshot();
      expect(before.capture.phase).toBe(phase);
      expect(chat.prepareSubmission()).toEqual({
        status: 'blocked',
        reason: 'Finish or cancel the current recording before sending.',
      });
      expect(chat.snapshot()).toMatchObject({
        draft: before.draft,
        turns: before.turns,
        capture: before.capture,
      });
      expect(chat.snapshot().submission).toBe(before.submission);

      expect(model.doStreamCalls).toHaveLength(0);
      if (phase === 'connecting') {
        await chat.captureAction();
        connected({ close: () => undefined, finish: async () => '' });
        await starting;
      } else if (phase === 'finishing') {
        finish('Final retained words');
        await finishing;
      }
    } finally {
      chat.dispose();
      voice.dispose();
      await db[Symbol.asyncDispose]();
    }
  },
);
