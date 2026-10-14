import { transactionFixture } from '../../vault/transactions/fixtures.test-support.ts';
import { expect, test, vi } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';
import { createTranscription } from '../../transcription.ts';
import { createNodeConversation, type NodeConversationOptions } from './node-conversation.ts';

async function fixture(overrides: Partial<NodeConversationOptions> = {}) {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent', name: 'Fictional' })]));
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

test('Chat owns a request before clearing its source and preserves newer typing through held initial acceptance and no-replay recovery', async () => {
  const { nodes, model, options } = await fixture();
  let accept!: () => void;
  let attempted!: () => void;
  const entered = new Promise<void>((resolve) => {
    attempted = resolve;
  });
  const held = new Promise<void>((resolve) => {
    accept = resolve;
  });
  let failing = true;
  const chat = createNodeConversation({
    ...options,
    nodes: transactionFixture({
      ...nodes,
      commit: async (value) => {
        if (value.kind.scope === 'chat' && value.kind.action === 'submit' && failing) {
          attempted();
          await held;
          throw new Error('Initial acceptance unavailable');
        }
        return nodes.commit(value);
      },
    }),
  });
  try {
    chat.setDraft('  First request  ');
    const owned = chat.prepareSubmission();
    expect(owned.status).toBe('owned');
    if (owned.status !== 'owned') throw new Error('Expected owned request');
    expect(owned.request).toMatchObject({
      text: 'First request',
      conversation: chat.conversation(),
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
    expect(chat.snapshot().review).toBe(busyState.review);
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
    expect(chat.snapshot().review).toBe(recoveryState.review);
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
    nodes.close();
  }
});

test('pre-handoff staged-context failure preserves the source and remains a meaningful blocked intent', async () => {
  const { nodes, model, options } = await fixture({
    stagedChanges: () => {
      throw new Error('Staged context unavailable');
    },
  });
  const chat = createNodeConversation(options);
  try {
    chat.setDraft('Keep my source draft');
    const before = chat.snapshot();
    expect(chat.prepareSubmission()).toEqual({
      status: 'blocked',
      reason: 'Staged context unavailable',
    });
    expect(chat.snapshot()).toMatchObject(before);
    expect(chat.snapshot().actionReason).toBe('Staged context unavailable');
    expect(model.doStreamCalls).toHaveLength(0);
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('request ownership is observable atomically with busy admission, including synchronous subscribers', async () => {
  const { nodes, options } = await fixture();
  const chat = createNodeConversation(options);
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
    nodes.close();
  }
});

test('review confirmation never publishes an idle handoff that admits a subscriber request', async () => {
  const files = [{ path: 'Pending.md', before: 'before', text: 'after' }];
  const { nodes, options } = await fixture({ stagedChanges: () => files });
  const chat = createNodeConversation(options);
  chat.setDraft('The reviewed request');
  const review = chat.prepareSubmission();
  if (review.status !== 'review') throw new Error('Expected review');
  let attempted = false;
  let second: ReturnType<typeof chat.prepareSubmission> | undefined;
  const unsubscribe = chat.subscribe(() => {
    if (chat.snapshot().review || attempted) return;
    attempted = true;
    second = chat.prepareSubmission({ text: 'A subscriber must not overlap confirmation' });
  });
  try {
    const first = chat.confirmReview(review.id);
    expect(second).toEqual({ status: 'blocked', reason: 'Wait for the Agent to finish.' });
    if (first.status !== 'owned') throw new Error('Expected owned reviewed request');
    await first.done;
    expect(chat.snapshot().turns.filter(({ role }) => role === 'user')).toHaveLength(1);
    expect(chat.snapshot().submission?.id).toBe(first.request.id);
  } finally {
    unsubscribe();
    chat.dispose();
    nodes.close();
  }
});

test.each([
  ['blank text', '  \n ', {}, 'Enter a message.'],
  [
    'unavailable saving',
    'Keep this text',
    { availability: 'Node storage is offline' },
    'Node storage is offline',
  ],
  [
    'unavailable execution',
    'Keep this text',
    { selectedModel: '' },
    'Select a model before sending.',
  ],
] as const)(
  '%s is denied without changing draft, conversation, or request state',
  async (_name, text, overrides, reason) => {
    const { nodes, model, options } = await fixture(overrides);
    const chat = createNodeConversation(options);
    try {
      chat.setDraft(text);
      const before = chat.snapshot();
      const identity = chat.conversation();
      expect(chat.snapshot().submissionAvailability).toEqual({ allowed: false, reason });
      expect(chat.prepareSubmission()).toEqual({ status: 'blocked', reason });
      expect(chat.snapshot()).toMatchObject({
        draft: before.draft,
        turns: before.turns,
        capture: before.capture,
      });
      expect(chat.snapshot().submission).toBe(before.submission);
      expect(chat.snapshot().review).toBe(before.review);
      expect(chat.conversation()).toBe(identity);
      expect(model.doStreamCalls).toHaveLength(0);
    } finally {
      chat.dispose();
      nodes.close();
    }
  },
);

test('synchronous handoff failure keeps the source and its revision for a later explicit retry', async () => {
  const { nodes, model, options } = await fixture();
  const chat = createNodeConversation(options);
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
    expect(chat.snapshot().review).toBe(original.review);
    expect(chat.draftIntent()).toEqual(intent);
    expect(model.doStreamCalls).toHaveLength(0);
    const owned = chat.prepareSubmission();
    if (owned.status !== 'owned') throw new Error('Expected explicit retry to own request');
    await owned.done;
    expect(chat.snapshot().draft).toBe('');
  } finally {
    identity.mockRestore();
    chat.dispose();
    nodes.close();
  }
});

test('asynchronous preparation failure preserves locally owned request text without clearing a newer draft', async () => {
  const { nodes, model, options } = await fixture();
  let fail = true;
  const chat = createNodeConversation({
    ...options,
    nodes: transactionFixture({
      ...nodes,
      snapshot: () => (fail ? Promise.reject(new Error('Snapshot unavailable')) : nodes.snapshot()),
    }),
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
    expect(chat.snapshot().turns[1]?.error).toBe('Snapshot unavailable');
    expect(model.doStreamCalls).toHaveLength(0);
    // The failed request was locally retained, never represented as durable acceptance.
    fail = false;
    const close = chat.watchRecords();
    await vi.waitFor(() => expect(chat.snapshot().records.chats).toEqual([]));
    close();
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('retained reviewed text submits without clearing a later draft revision with identical text', async () => {
  const files = [{ path: 'Pending.md', before: 'before', text: 'after' }];
  const { nodes, options } = await fixture({ stagedChanges: () => files });
  const chat = createNodeConversation(options);
  try {
    chat.setDraft('Text for review');
    const review = chat.prepareSubmission();
    expect(review.status).toBe('review');
    if (review.status !== 'review') throw new Error('Expected review');
    chat.setDraft('Text for review');
    const outcome = chat.confirmReview();
    if (outcome.status !== 'owned') throw new Error('Expected retained reviewed request');
    await outcome.done;
    expect(chat.snapshot().draft).toBe('Text for review');
    expect(chat.snapshot().turns[0]?.parts).toEqual([{ kind: 'text', text: 'Text for review' }]);
    expect(options.stagedChanges?.()).toEqual(files);
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('confirmation refreshes changed staged evidence and requires another explicit confirmation', async () => {
  const files = [{ path: 'Pending.md', before: 'original', text: 'first edit' }];
  const { nodes, model, options } = await fixture({ stagedChanges: () => files });
  const chat = createNodeConversation(options);
  try {
    chat.setDraft('The retained reviewed message');
    chat.prepareSubmission();
    files[0]!.text = 'changed edit';
    chat.setDraft('Newer text after review began');
    const refreshed = chat.confirmReview();
    expect(refreshed.status).toBe('review');
    expect(chat.snapshot().review?.files[0]?.text).toBe('changed edit');
    expect(chat.snapshot().review?.reason).toContain('changed');
    expect(chat.snapshot().turns).toEqual([]);
    expect(model.doStreamCalls).toHaveLength(0);
    const sent = chat.confirmReview();
    if (sent.status !== 'owned') throw new Error('Expected explicit re-confirmation');
    await sent.done;
    expect(chat.snapshot().review).toBeUndefined();
    expect(chat.snapshot().draft).toBe('Newer text after review began');
    expect(chat.snapshot().turns[0]?.parts).toEqual([
      { kind: 'text', text: 'The retained reviewed message' },
    ]);
    expect(options.stagedChanges?.()).toEqual(files);
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('review belongs to Chat across view closure and cancellation preserves the current draft', async () => {
  const files = [{ path: 'Pending.md', before: 'before', text: 'after' }];
  const { nodes, model, options } = await fixture({ stagedChanges: () => files });
  const chat = createNodeConversation(options);
  try {
    chat.setDraft('The message being reviewed');
    const close = chat.viewing();
    const outcome = chat.prepareSubmission();
    close();
    expect(chat.snapshot().review).toMatchObject({
      intent: { text: 'The message being reviewed' },
      files,
    });
    expect(outcome).toBe(chat.snapshot().review);
    chat.setDraft('A later editable draft');
    expect(chat.cancelReview()).toEqual({ status: 'cancelled' });
    expect(chat.snapshot().review).toBeUndefined();
    expect(chat.snapshot().draft).toBe('A later editable draft');
    expect(model.doStreamCalls).toHaveLength(0);
    expect(options.stagedChanges?.()).toEqual(files);
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('blocked confirmation keeps reviewed text and exposes the current permission without sending', async () => {
  const files = [{ path: 'Pending.md', before: 'before', text: 'after' }];
  const { nodes, model, options } = await fixture({ stagedChanges: () => files });
  const chat = createNodeConversation(options);
  try {
    chat.setDraft('Reviewed text');
    chat.prepareSubmission();
    chat.updateOptions({ ...options, availability: 'Saving is unavailable' });
    expect(chat.confirmReview()).toEqual({ status: 'blocked', reason: 'Saving is unavailable' });
    expect(chat.snapshot().review).toMatchObject({
      intent: { text: 'Reviewed text' },
      files,
      reason: 'Saving is unavailable',
    });
    chat.updateOptions({
      ...options,
      stagedChanges: () => {
        throw new Error('Cannot read current edits');
      },
    });
    expect(chat.confirmReview()).toEqual({
      status: 'blocked',
      reason: 'Cannot read current edits',
    });
    expect(chat.snapshot().review?.reason).toBe('Cannot read current edits');
    expect(chat.snapshot().draft).toBe('Reviewed text');
    expect(model.doStreamCalls).toHaveLength(0);
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('another submission cannot replace or bypass a retained review', async () => {
  const { nodes, model, options } = await fixture({
    stagedChanges: () => [{ path: 'Pending.md', before: 'before', text: 'after' }],
  });
  const chat = createNodeConversation(options);
  try {
    chat.setDraft('Original reviewed message');
    chat.prepareSubmission();
    const review = chat.snapshot().review;
    chat.setDraft('Newer source draft');
    expect(chat.prepareSubmission().status).toBe('blocked');
    expect(chat.snapshot().review).toBe(review);
    expect(chat.snapshot().draft).toBe('Newer source draft');
    expect(model.doStreamCalls).toHaveLength(0);
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('a review superseded during staged-evidence reading cannot submit or restore its old task', async () => {
  const files = [{ path: 'Pending.md', before: 'before', text: 'after' }];
  const { nodes, model, options } = await fixture({ stagedChanges: () => files });
  const chat = createNodeConversation(options);
  try {
    chat.setDraft('Original review');
    chat.prepareSubmission();
    chat.updateOptions({
      ...options,
      stagedChanges: () => {
        chat.cancelReview();
        return files;
      },
    });
    expect(chat.confirmReview().status).toBe('blocked');
    expect(chat.snapshot().review).toBeUndefined();
    expect(chat.snapshot().draft).toBe('Original review');
    expect(model.doStreamCalls).toHaveLength(0);
  } finally {
    chat.dispose();
    nodes.close();
  }
});

test('a completed transcription is a newer source revision than an earlier retained submission intent', async () => {
  const voice = createTranscription(async () => ({
    close: () => undefined,
    finish: async () => 'New spoken words',
  }));
  const { nodes, options } = await fixture({ transcription: voice });
  const chat = createNodeConversation(options);
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
    nodes.close();
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
    const { nodes, model, options } = await fixture({ transcription: voice });
    const chat = createNodeConversation(options);
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
      expect(chat.snapshot().review).toBe(before.review);
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
      nodes.close();
    }
  },
);
