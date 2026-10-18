import { controlledChatStorage } from './controller-storage.test-support.ts';
import { chatFixture } from './fixtures.test-support.ts';
import { expect, test, vi } from 'vitest';
import { createConversation } from './conversation.ts';
import { createTranscription } from '@/modules/transcription/capture.ts';
import type { TranscriptionEvents } from '@/modules/transcription/capture.ts';

async function fixture() {
  const { db, options } = await chatFixture();
  return { db, options: { ...options, suggestions: async () => [] } };
}

test('Chat borrows Transcription without cancelling an independently started recording', async () => {
  let events!: TranscriptionEvents;
  let closed = false;
  const voice = createTranscription(async (next) => {
    events = next;
    return {
      close: () => {
        closed = true;
      },
      finish: async () => 'Independent words',
    };
  });
  const { db, options } = await fixture();
  const chat = createConversation({ ...options, transcription: voice });
  try {
    await voice.start();
    chat.setDraft('Editable Chat text');
    expect(voice.snapshot().phase).toBe('listening');
    expect((await chat.captureAction()).status).toBe('blocked');
    chat.dispose();
    chat.dispose();
    events.text('Independent words');
    expect(voice.snapshot()).toMatchObject({ phase: 'listening', text: 'Independent words' });
    expect(closed).toBe(false);
    await voice.finish();
    expect(voice.snapshot().text).toBe('Independent words');
  } finally {
    chat.dispose();
    voice.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('replacing borrowed Transcription releases only the recording Chat started and ignores late output', async () => {
  let events!: TranscriptionEvents;
  let connected!: (connection: { close: () => void; finish: () => Promise<string> }) => void;
  let closes = 0;
  const first = createTranscription((next) => {
    events = next;
    return new Promise((resolve) => {
      connected = resolve;
    });
  });
  const second = createTranscription(async () => ({
    close: () => undefined,
    finish: async () => 'New words',
  }));
  const { db, options } = await fixture();
  const chat = createConversation({ ...options, transcription: first });
  try {
    chat.setDraft('Prefix');
    const opening = chat.captureAction();
    events.text('available words');
    chat.updateOptions({ ...options, transcription: second });
    events.text('stale words');
    connected({
      close: () => {
        closes++;
      },
      finish: async () => 'Old words',
    });
    await opening;
    expect(closes).toBe(1);
    expect(chat.snapshot().draft).toBe('Prefix available words');
    await chat.captureAction();
    await chat.captureAction();
    expect(chat.snapshot().draft).toBe('Prefix available words New words');
    void first.start();
    chat.dispose();
    expect(first.snapshot().phase).toBe('connecting');
  } finally {
    chat.dispose();
    first.dispose();
    second.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('a replaced Vault session destroys pending prompts without disposing borrowed storage', async () => {
  const { db, options } = await fixture();
  const next = await fixture();
  const voice = createTranscription(async () => ({ finish: async () => '', close() {} }));
  const chat = createConversation({
    ...options,
    transcription: voice,
  });
  try {
    chat.setDraft('Retained words');
    await chat.captureAction();
    chat.receivePrompt({ n: 1, text: 'Retained Ask', send: true });
    expect(chat.snapshot().prompts).toHaveLength(1);
    chat.updateOptions(next.options);
    const closed = chat.snapshot();
    expect(chat.closed()).toBe(true);
    expect(chat.prepareSubmission().status).toBe('blocked');
    expect(chat.applyPrompt(1).status).toBe('blocked');
    chat.updateOptions(options);
    chat.setDraft('Cannot revive');
    expect(chat.snapshot()).toBe(closed);
    expect(await db.transaction((tx) => tx.entities.conversations.query({ select: {} }))).toEqual(
      [],
    );
    const fresh = createConversation(next.options);
    expect(fresh.snapshot()).toMatchObject({ draft: '', prompts: [], turns: [] });

    fresh.dispose();
    voice.dispose();
  } finally {
    chat.dispose();
    await db[Symbol.asyncDispose]();
    await next.db[Symbol.asyncDispose]();
  }
});

test('an accepted run keeps its model context while later explicit work uses changed capabilities', async () => {
  const { db, options } = await fixture();
  const { MockLanguageModelV4, convertArrayToReadableStream } = await import('ai/test');
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const response = (text: string) => ({
    stream: convertArrayToReadableStream([
      { type: 'stream-start' as const, warnings: [] },
      { type: 'text-start' as const, id: 'text' },
      { type: 'text-delta' as const, id: 'text', delta: text },
      { type: 'text-end' as const, id: 'text' },
      {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
      },
    ]),
  });
  const oldModel = new MockLanguageModelV4({
    doStream: async () => {
      entered();
      await held;
      return response('Old capability answer');
    },
  });
  const newModel = new MockLanguageModelV4({
    doStream: async () => response('New capability answer'),
  });
  const chat = createConversation({ ...options, model: async () => oldModel });
  try {
    const old = chat.prepareSubmission({ text: 'First explicit work' });
    if (old.status !== 'owned') throw new Error('Expected owned request');
    await started;
    chat.updateOptions({
      ...options,
      model: async () => newModel,
      selectedModel: 'new-model',
      instructions: 'New instructions',
    });
    release();
    await old.done;
    expect(chat.snapshot().turns.at(-1)?.parts).toEqual([
      { kind: 'text', text: 'Old capability answer' },
    ]);
    const next = chat.prepareSubmission({ text: 'Next explicit work' });
    if (next.status !== 'owned') throw new Error('Expected new request');
    await next.done;
    expect(next.request.model).toBe('new-model');
    expect(chat.snapshot().turns.at(-1)?.parts).toEqual([
      { kind: 'text', text: 'New capability answer' },
    ]);
  } finally {
    release();
    chat.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('destroying Chat during held durable acceptance retains that record but admits no model or later save', async () => {
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempts = 0;
  const storage = controlledChatStorage(async (request) => {
    attempts++;
    if (request.commit.facts.some((fact) => fact.value === 'chat.exchange')) {
      entered();
      await held;
    }
  });
  const { db, options } = await chatFixture(storage);
  let modelUsed = false;
  const chat = createConversation({
    ...options,
    model: async () => {
      modelUsed = true;
      throw new Error('Closed session executed');
    },
  });
  try {
    const outcome = chat.prepareSubmission({ text: 'Accepted before shutdown' });
    if (outcome.status !== 'owned') throw new Error('Expected request');
    await started;
    chat.dispose();
    const closed = chat.snapshot();
    release();
    await outcome.done;
    await vi.waitFor(async () =>
      expect(
        await db.transaction((tx) =>
          tx.entities.exchanges.first({
            where: { submission: { eq: outcome.request.id } },
            select: {},
          }),
        ),
      ).toBeDefined(),
    );
    expect(modelUsed).toBe(false);
    expect(attempts).toBe(2);
    expect(chat.snapshot()).toBe(closed);
  } finally {
    release();
    chat.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('a recovery requested just before destruction cannot start another acceptance attempt', async () => {
  let attempts = 0;
  const { db, options } = await chatFixture(
    controlledChatStorage(async () => {
      attempts++;
      throw new Error('Acceptance unavailable');
    }),
  );
  const chat = createConversation(options);
  try {
    const outcome = chat.prepareSubmission({ text: 'Retained acceptance obligation' });
    if (outcome.status !== 'owned') throw new Error('Expected request');
    await vi.waitFor(() => expect(chat.snapshot().persistenceStage).toBe('initial'));
    const retry = chat.retrySave();
    chat.dispose();
    await retry;
    await outcome.done;
    expect(attempts).toBe(1);
  } finally {
    chat.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('recording capability updates affect the next capture and hide interruption preserves available words', async () => {
  let events!: TranscriptionEvents;
  let oldClosed = false;
  const voice = createTranscription(async (next) => {
    events = next;
    return {
      close: () => {
        oldClosed = true;
      },
      finish: async () => 'Old final speech',
    };
  });
  const { db, options } = await fixture();
  const chat = createConversation({ ...options, transcription: voice });
  try {
    chat.setDraft('Prefix');
    await chat.captureAction();
    events.text('available speech');
    voice.configure(async () => ({
      close: () => undefined,
      finish: async () => 'New final speech',
    }));
    expect(oldClosed).toBe(false);
    await chat.captureAction();
    expect(chat.snapshot().draft).toBe('Prefix Old final speech');
    await chat.captureAction();
    await chat.captureAction();
    expect(chat.snapshot().draft).toBe('Prefix Old final speech New final speech');
    await chat.captureAction();
    voice.interrupt();
    expect(chat.snapshot().draft).toBe('Prefix Old final speech New final speech');
    expect(chat.snapshot().capture.phase).toBe('error');
  } finally {
    chat.dispose();
    voice.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('manual replacement publishes its newer draft before recording cancellation can admit a subscriber submission', async () => {
  const voice = createTranscription(async () => ({
    close: () => undefined,
    finish: async () => 'Speech',
  }));
  const { db, options } = await fixture();
  const chat = createConversation({ ...options, transcription: voice });
  let sent: ReturnType<typeof chat.prepareSubmission> | undefined;
  try {
    chat.setDraft('Old draft');
    await chat.captureAction();
    const unsubscribe = chat.subscribe(() => {
      if (!sent && chat.snapshot().submissionAvailability.allowed) sent = chat.prepareSubmission();
    });
    chat.setDraft('New manual replacement');
    unsubscribe();
    expect(sent?.status).toBe('owned');
    if (sent?.status !== 'owned') throw new Error('Expected subscriber request');
    expect(sent.request.text).toBe('New manual replacement');
    await sent.done;
  } finally {
    chat.dispose();
    voice.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('changed suggestion capabilities invalidate optional old results before later explicit suggestions', async () => {
  const { db, options } = await fixture();
  let release!: (text: string[]) => void;
  const held = new Promise<string[]>((resolve) => {
    release = resolve;
  });
  const chat = createConversation({ ...options, suggestions: async () => held });
  try {
    const previous = chat.suggest();
    chat.updateOptions({
      ...options,
      selectedModel: 'new-model',
      suggestions: async () => ['New suggestion'],
    });
    release(['Stale suggestion']);
    await previous;
    expect(chat.snapshot().suggestions).toEqual([]);
    await chat.suggest();
    expect(chat.snapshot().suggestions).toEqual(['New suggestion']);
  } finally {
    release([]);
    chat.dispose();
    await db[Symbol.asyncDispose]();
  }
});

test('changed permission and capabilities become available atomically to synchronous Chat subscribers', async () => {
  const { db, options } = await fixture();
  let oldUsed = false;
  let newUsed = false;
  const chat = createConversation({
    ...options,
    availability: 'Unavailable',
    model: async () => {
      oldUsed = true;
      throw new Error('Old capability');
    },
  });
  chat.setDraft('New explicit work');
  let owned: ReturnType<typeof chat.prepareSubmission> | undefined;
  const unsubscribe = chat.subscribe(() => {
    if (!owned && chat.snapshot().submissionAvailability.allowed) owned = chat.prepareSubmission();
  });
  try {
    chat.updateOptions({
      ...options,
      model: async () => {
        newUsed = true;
        throw new Error('New capability');
      },
    });
    if (owned?.status !== 'owned') throw new Error('Expected request');
    await owned.done;
    expect(oldUsed).toBe(false);
    expect(newUsed).toBe(true);
  } finally {
    unsubscribe();
    chat.dispose();
    await db[Symbol.asyncDispose]();
  }
});
