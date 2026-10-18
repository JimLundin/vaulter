import { expect, test, vi } from 'vitest';
import { createPersistentStorage, type AppendRequest, type Journal } from '@/core/store/index.ts';
import { chatFixture } from './fixtures.test-support.ts';
import { createConversation } from './conversation.ts';
import { createEavChatBackend } from './eav-backend.ts';

function storageFixture(append: (request: AppendRequest) => void | Promise<void>) {
  let journal: Journal = { commits: [], schemas: [] };
  return createPersistentStorage({
    scope: 'chat-recovery',
    load: async () => journal,
    append: async (request) => {
      await append(request);
      journal = { schemas: request.schemas, commits: [...journal.commits, request.commit] };
    },
  });
}
const terminal = (request: AppendRequest) =>
  request.commit.facts.some(
    (fact) => fact.attribute === 'agent.run/status' && fact.value === 'running' && !fact.added,
  );
const initial = (request: AppendRequest) =>
  request.commit.facts.some((fact) => fact.attribute === 'chat.exchange/submission');
const execution = async () => ({ status: 'complete' as const, text: 'Recorded.' });

test('an unseen completed reply remains unread through failed record refresh and recovery until a view acknowledges it', async () => {
  let readsFail = false;
  const { db, options } = await chatFixture(
    storageFixture((request) => {
      if (terminal(request)) readsFail = true;
    }),
  );
  await using _db = db;
  const execute = vi.fn(execution);
  const conversation = createConversation({
    ...options,
    execution: execute,
    backend: (settings) => {
      const backend = createEavChatBackend({ ...settings, database: options.database });
      return {
        ...backend,
        messages: () =>
          readsFail ? Promise.reject(new Error('Recorded view unavailable')) : backend.messages(),
      };
    },
  });
  try {
    const submitted = conversation.prepareSubmission({ text: 'Reply while Chat is hidden' });
    if (submitted.status !== 'owned') throw new Error('Expected retained request');
    await submitted.done;
    expect(conversation.snapshot().recovery.refresh?.error).toBe('Recorded view unavailable');
    expect(conversation.snapshot().unread).toBe(true);
    readsFail = false;
    await conversation.refreshContext();
    expect(conversation.snapshot().recovery).toEqual({});
    expect(conversation.snapshot().turns[1]?.parts).toEqual([{ kind: 'text', text: 'Recorded.' }]);
    expect(conversation.snapshot().unread).toBe(true);
    const close = conversation.viewing();
    expect(conversation.snapshot().unread).toBe(false);
    close();
    await conversation.refreshContext();
    expect(conversation.snapshot().unread).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
  } finally {
    conversation.dispose();
  }
});

test('known Agent completion becomes unread while its terminal save is still pending', async () => {
  let entered!: () => void;
  let release!: () => void;
  const saving = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { db, options } = await chatFixture(
    storageFixture(async (request) => {
      if (terminal(request)) {
        entered();
        await held;
      }
    }),
  );
  await using _db = db;
  const conversation = createConversation({ ...options, execution });
  const submitted = conversation.prepareSubmission({ text: 'Reply outside Chat' });
  if (submitted.status !== 'owned') throw new Error('Expected retained request');
  try {
    await saving;
    expect(conversation.snapshot().turns[1]?.parts).toEqual([{ kind: 'text', text: 'Recorded.' }]);
    expect(conversation.snapshot().unread).toBe(true);
    const close = conversation.viewing();
    expect(conversation.snapshot().unread).toBe(false);
    close();
  } finally {
    release();
    await submitted.done;
    conversation.dispose();
  }
  expect(conversation.snapshot().unread).toBe(false);
});

test('views share initial-acceptance recovery progress and reconciliation never executes unknown history', async () => {
  let failed = true;
  let retries = 0;
  let release!: () => void;
  const holding = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { db, options } = await chatFixture(
    storageFixture(async (request) => {
      if (initial(request)) {
        if (failed) throw new Error('Acceptance response unavailable');
        retries++;
        await holding;
      }
    }),
  );
  await using _db = db;
  const execute = vi.fn(execution);
  const conversation = createConversation({ ...options, execution: execute });
  try {
    conversation.setDraft('Retain this request');
    const submitted = conversation.prepareSubmission();
    if (submitted.status !== 'owned') throw new Error('Expected retained request');
    await submitted.done;
    expect(conversation.snapshot().recovery.save).toMatchObject({
      stage: 'initial',
      error: 'Acceptance response unavailable',
      inProgress: false,
      allowed: true,
    });
    conversation.setDraft('A newer draft');
    failed = false;
    const first = conversation.retrySave();
    const second = conversation.retrySave();
    await vi.waitFor(() => expect(retries).toBe(1));
    expect(conversation.snapshot().recovery.save).toMatchObject({
      inProgress: true,
      allowed: false,
    });
    expect(conversation.snapshot().submission?.id).toBe(submitted.request.id);
    expect(conversation.snapshot().draft).toBe('A newer draft');
    release();
    await Promise.all([first, second]);
    expect(conversation.snapshot().recovery.save).toBeUndefined();
    expect(conversation.snapshot().phase).toBe('recorded');
    expect(conversation.snapshot().unread).toBe(false);
    expect(conversation.snapshot().draft).toBe('A newer draft');
    expect(execute).not.toHaveBeenCalled();
  } finally {
    release();
    conversation.dispose();
  }
});

test('terminal saving and accepted-record refresh remain separate shared obligations after Agent completes', async () => {
  let saveFails = true;
  let readsFail = false;
  let retries = 0;
  let refreshReads = 0;
  let holdReads = false;
  let releaseSave!: () => void;
  let releaseRead!: () => void;
  const saving = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const { db, options } = await chatFixture(
    storageFixture(async (request) => {
      if (terminal(request)) {
        readsFail = true;
        if (saveFails) throw new Error('Terminal save unavailable');
        retries++;
        await saving;
      }
    }),
  );
  await using _db = db;
  const execute = vi.fn(execution);
  const conversation = createConversation({
    ...options,
    execution: execute,
    backend: (settings) => {
      const backend = createEavChatBackend({ ...settings, database: options.database });
      return {
        ...backend,
        messages: async () => {
          if (readsFail) throw new Error('Recorded view unavailable');
          if (holdReads) {
            refreshReads++;
            await reading;
          }
          return backend.messages();
        },
      };
    },
  });
  try {
    const submitted = conversation.prepareSubmission({ text: 'First request' });
    if (submitted.status !== 'owned') throw new Error('Expected retained request');
    await submitted.done;
    await conversation.refreshContext();
    expect(conversation.snapshot().recovery).toMatchObject({
      save: { stage: 'terminal', error: 'Terminal save unavailable' },
      refresh: { error: 'Recorded view unavailable' },
    });
    expect(conversation.snapshot().turns[1]?.parts).toEqual([{ kind: 'text', text: 'Recorded.' }]);
    expect(conversation.snapshot().unread).toBe(true);
    const acknowledge = conversation.viewing();
    expect(conversation.snapshot().unread).toBe(false);
    acknowledge();
    conversation.setDraft('Next request');
    saveFails = false;
    const first = conversation.retrySave();
    const second = conversation.retrySave();
    await vi.waitFor(() => expect(retries).toBe(1));
    expect(conversation.snapshot().recovery.save?.inProgress).toBe(true);
    releaseSave();
    await Promise.all([first, second]);
    expect(conversation.snapshot().recovery.save).toBeUndefined();
    expect(conversation.snapshot().recovery.refresh?.error).toBe('Recorded view unavailable');
    expect(conversation.snapshot().unread).toBe(false);
    readsFail = false;
    holdReads = true;
    const refresh = conversation.refreshContext();
    const refreshAgain = conversation.refreshContext();
    await vi.waitFor(() => expect(refreshReads).toBeGreaterThan(0));
    expect(conversation.snapshot().recovery.refresh).toMatchObject({
      inProgress: true,
      allowed: false,
    });
    releaseRead();
    await Promise.all([refresh, refreshAgain]);
    expect(conversation.snapshot().recovery).toEqual({});
    expect(conversation.snapshot().draft).toBe('Next request');
    expect(conversation.snapshot().turns[1]?.parts).toEqual([{ kind: 'text', text: 'Recorded.' }]);
    expect(conversation.snapshot().unread).toBe(false);
    await conversation.retrySave();
    expect(conversation.snapshot().unread).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
  } finally {
    releaseSave();
    releaseRead();
    conversation.dispose();
  }
});

test('a synchronous observer cannot start a competing owner retry during admission', async () => {
  let failing = true;
  let attempts = 0;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { db, options } = await chatFixture(
    storageFixture(async (request) => {
      if (terminal(request)) {
        attempts++;
        if (failing) throw new Error('Terminal unavailable');
        await waiting;
      }
    }),
  );
  await using _db = db;
  const backend = createEavChatBackend({ ...options, execution });
  try {
    const retained = backend.send({
      id: 'request',
      text: 'Retain',
      model: 'fictional',
    });
    await retained.done;
    let observed = false;
    let concurrent!: Promise<unknown>;
    retained.subscribe(() => {
      if (observed || !retained.snapshot().recovery?.save?.inProgress) return;
      observed = true;
      concurrent = retained.retrySave();
    });
    failing = false;
    const retry = retained.retrySave();
    await vi.waitFor(() => expect(observed).toBe(true));
    release();
    await Promise.all([retry, concurrent]);
    expect(attempts).toBe(2);
  } finally {
    release();
    backend.dispose();
  }
});

test('a failed retry returns settled owner progress while retaining its exact recovery obligation', async () => {
  const { db, options } = await chatFixture(
    storageFixture((request) => {
      if (terminal(request)) throw new Error('Terminal unavailable');
    }),
  );
  await using _db = db;
  const backend = createEavChatBackend({ ...options, execution });
  try {
    const retained = backend.send({
      id: 'request',
      text: 'Retain',
      model: 'fictional',
    });
    await retained.done;
    expect((await retained.retrySave()).recovery?.save).toMatchObject({
      stage: 'terminal',
      error: 'Terminal unavailable',
      inProgress: false,
      allowed: true,
    });
  } finally {
    backend.dispose();
  }
});
