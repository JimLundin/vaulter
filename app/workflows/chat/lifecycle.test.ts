import {
  transactionOptionsFixture,
  transactionFixture,
} from '../../vault/transactions/fixtures.test-support.ts';
import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { seed } from '../../vault/nodes/fixtures.test-support.ts';
import { createNodeConversation } from './node-conversation.ts';
import { createTranscription } from './transcription.ts';
import type { TranscriptionEvents } from './transcription.ts';

async function fixture() {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  const options = {
    nodes,
    user: 'user',
    agent: 'user',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: '',
    model: () => Promise.reject(new Error('No execution expected')),
    suggestions: async () => [],
  };
  return { nodes, options };
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
  const { nodes, options } = await fixture();
  const chat = createNodeConversation(
    transactionOptionsFixture({ ...options, transcription: voice }),
  );
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
    nodes.close();
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
  const { nodes, options } = await fixture();
  const chat = createNodeConversation(
    transactionOptionsFixture({ ...options, transcription: first }),
  );
  try {
    chat.setDraft('Prefix');
    const opening = chat.captureAction();
    events.text('available words');
    chat.updateOptions(transactionOptionsFixture({ ...options, transcription: second }));
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
    nodes.close();
  }
});

test('a replaced Vault session destroys pending review and prompts without disposing borrowed storage', async () => {
  const { nodes, options } = await fixture();
  const next = await fixture();
  const chat = createNodeConversation(
    transactionOptionsFixture({
      ...options,
      stagedChanges: () => [{ path: 'Pending', before: 'a', text: 'b' }],
    }),
  );
  try {
    chat.setDraft('Reviewed words');
    const review = chat.prepareSubmission();
    expect(review.status).toBe('review');
    chat.receivePrompt({ n: 1, text: 'Retained Ask', send: true });
    expect(chat.snapshot().prompts).toHaveLength(1);
    chat.updateOptions(transactionOptionsFixture(next.options));
    const closed = chat.snapshot();
    expect(chat.closed()).toBe(true);
    expect(chat.confirmReview().status).toBe('blocked');
    expect(chat.applyPrompt(1).status).toBe('blocked');
    chat.updateOptions(transactionOptionsFixture(options));
    chat.setDraft('Cannot revive');
    expect(chat.snapshot()).toBe(closed);
    expect(await nodes.snapshot()).toBeDefined();
    const fresh = createNodeConversation(transactionOptionsFixture(next.options));
    expect(fresh.snapshot()).toMatchObject({ draft: '', prompts: [], turns: [] });
    expect(fresh.conversation()).not.toBe(chat.conversation());
    fresh.dispose();
  } finally {
    chat.dispose();
    nodes.close();
    next.nodes.close();
  }
});

test('an accepted run keeps its model context while later explicit work uses changed capabilities', async () => {
  const { nodes, options } = await fixture();
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
  const chat = createNodeConversation(
    transactionOptionsFixture({ ...options, model: async () => oldModel }),
  );
  try {
    const old = chat.prepareSubmission({ text: 'First explicit work' });
    if (old.status !== 'owned') throw new Error('Expected owned request');
    await started;
    chat.updateOptions(
      transactionOptionsFixture({
        ...options,
        model: async () => newModel,
        selectedModel: 'new-model',
        instructions: 'New instructions',
      }),
    );
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
    nodes.close();
  }
});

test('destroying Chat during held durable acceptance retains that record but admits no model or later save', async () => {
  const { nodes, options } = await fixture();
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const commits: string[] = [];
  let modelUsed = false;
  let published = false;
  const chat = createNodeConversation({
    ...options,
    model: async () => {
      modelUsed = true;
      throw new Error('Closed session executed');
    },
    onConversation: () => {
      published = true;
    },
    nodes: transactionFixture({
      ...nodes,
      commit: async (value) => {
        commits.push(`${value.kind.scope}:${value.kind.action}`);
        if (value.kind.scope === 'chat' && value.kind.action === 'submit') {
          entered();
          await held;
        }
        return nodes.commit(value);
      },
    }),
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
        (await nodes.history()).some(
          (record) => record.metadata?.chatRequest === outcome.request.id,
        ),
      ).toBe(true),
    );
    expect(modelUsed).toBe(false);
    expect(published).toBe(false);
    expect(commits).toEqual(['chat:submit']);
    expect(chat.snapshot()).toBe(closed);
  } finally {
    release();
    chat.dispose();
    nodes.close();
  }
});

test('a recovery requested just before destruction cannot start another acceptance attempt', async () => {
  const { nodes, options } = await fixture();
  let attempts = 0;
  const chat = createNodeConversation({
    ...options,
    nodes: transactionFixture({
      ...nodes,
      commit: async (value) => {
        attempts++;
        if (value.kind.scope === 'chat') throw new Error('Acceptance unavailable');
        return nodes.commit(value);
      },
    }),
  });
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
    nodes.close();
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
  const { nodes, options } = await fixture();
  const chat = createNodeConversation(
    transactionOptionsFixture({ ...options, transcription: voice }),
  );
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
    nodes.close();
  }
});

test('manual replacement publishes its newer draft before recording cancellation can admit a subscriber submission', async () => {
  const voice = createTranscription(async () => ({
    close: () => undefined,
    finish: async () => 'Speech',
  }));
  const { nodes, options } = await fixture();
  const chat = createNodeConversation(
    transactionOptionsFixture({ ...options, transcription: voice }),
  );
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
    nodes.close();
  }
});

test('store readiness in one session rebinds saved records and invalidates old selection reads', async () => {
  const { nodes, options } = await fixture();
  const { create, request } = await import('../../vault/nodes/fixtures.test-support.ts');
  const session = {};
  let read!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    read = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const unavailable = {
    ...nodes,
    snapshot: async (sequence?: number) => {
      read();
      await held;
      return nodes.snapshot(sequence);
    },
  };
  const chat = createNodeConversation({
    ...options,
    nodes: transactionFixture(unavailable),
    session,
  });
  const close = chat.watchRecords();
  try {
    const selection = chat.open('old-selection');
    await entered;
    chat.setDraft('Same-session draft');
    chat.updateOptions(transactionOptionsFixture({ ...options, session }));
    release();
    expect(await selection).toEqual({ status: 'superseded' });
    expect(chat.snapshot().draft).toBe('Same-session draft');
    await nodes.commit(
      request('saved', [
        create('saved-chat', {
          kind: 'conversation',
          title: 'Ready history',
          createdAt: '2026-10-10T12:00:00Z',
        }),
      ]),
    );
    await vi.waitFor(() =>
      expect(chat.snapshot().records.chats?.[0]?.data.title).toBe('Ready history'),
    );
  } finally {
    release();
    close();
    close();
    chat.dispose();
    nodes.close();
  }
});

test('changed suggestion capabilities invalidate optional old results before later explicit suggestions', async () => {
  const { nodes, options } = await fixture();
  let release!: (text: string[]) => void;
  const held = new Promise<string[]>((resolve) => {
    release = resolve;
  });
  const chat = createNodeConversation(
    transactionOptionsFixture({ ...options, suggestions: async () => held }),
  );
  try {
    const previous = chat.suggest();
    chat.updateOptions(
      transactionOptionsFixture({
        ...options,
        selectedModel: 'new-model',
        suggestions: async () => ['New suggestion'],
      }),
    );
    release(['Stale suggestion']);
    await previous;
    expect(chat.snapshot().suggestions).toEqual([]);
    await chat.suggest();
    expect(chat.snapshot().suggestions).toEqual(['New suggestion']);
  } finally {
    release([]);
    chat.dispose();
    nodes.close();
  }
});

test('changed permission and capabilities become available atomically to synchronous Chat subscribers', async () => {
  const { nodes, options } = await fixture();
  let oldUsed = false;
  let newUsed = false;
  const chat = createNodeConversation(
    transactionOptionsFixture({
      ...options,
      availability: 'Unavailable',
      model: async () => {
        oldUsed = true;
        throw new Error('Old capability');
      },
    }),
  );
  chat.setDraft('New explicit work');
  let owned: ReturnType<typeof chat.prepareSubmission> | undefined;
  const unsubscribe = chat.subscribe(() => {
    if (!owned && chat.snapshot().submissionAvailability.allowed) owned = chat.prepareSubmission();
  });
  try {
    chat.updateOptions(
      transactionOptionsFixture({
        ...options,
        model: async () => {
          newUsed = true;
          throw new Error('New capability');
        },
      }),
    );
    if (owned?.status !== 'owned') throw new Error('Expected request');
    await owned.done;
    expect(oldUsed).toBe(false);
    expect(newUsed).toBe(true);
  } finally {
    unsubscribe();
    chat.dispose();
    nodes.close();
  }
});
