import { expect, test } from 'vitest';
import { createMemoryStorage, openDatabase } from '@/core/store/index.ts';
import {
  appendExchange,
  appendRetainedContribution,
  chatSchema,
  projectedExchange,
} from './index.ts';
import { submitChat } from './submission.ts';
import { chatFixture } from './fixtures.test-support.ts';
import { createConversation } from './index.ts';

const at = '2026-10-18T12:30:00+02:00';

test('retained contribution metadata remains exact through revisions, historical reads and reopen', async () => {
  const storage = createMemoryStorage();
  await using db = await openDatabase({ schema: chatSchema, storage });
  const input = {
    methods: ['dictated', 'typed'],
    language: 'sv',
    transcription: {
      provider: 'sample',
      model: 'sample-voice',
      request: 'sample-request',
      started: at,
      ended: '2026-10-18T12:30:04+02:00',
      durationMs: 4000,
      segments: [{ offsetMs: 0, final: true }],
    },
    suppliedUnknown: null,
  };
  const user = { kind: 'message' as const, role: 'user' as const, at, text: 'Sample', input };
  const agent = {
    kind: 'message' as const,
    role: 'agent' as const,
    at,
    status: 'failed' as const,
    parts: [{ kind: 'text' as const, text: 'Sample response' }],
    model: 'sample-model',
    tokens: { in: 10, out: 4 },
    error: 'Recorded source failure',
  };
  const records = await db.transaction(async (tx) => {
    const exchange = await appendExchange(tx);
    await appendRetainedContribution(tx, exchange, { position: 0, message: user, provenance: {} });
    const source = await appendRetainedContribution(tx, exchange, {
      position: 1,
      message: agent,
      provenance: { imported: true },
    });
    return { exchange, source };
  });
  const original = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await db.transaction((tx) =>
    tx.entities.retainedSources.update({ ...records.source, model: null, tokens: null }),
  );
  await using reopened = await openDatabase({ schema: chatSchema, storage });
  expect(await projectedExchange(reopened.at(original), records.exchange)).toEqual([user, agent]);
  expect(await reopened.transaction((tx) => projectedExchange(tx, records.exchange))).toEqual([
    user,
    { ...agent, model: null, tokens: null },
  ]);
  expect(await reopened.entities.agentRuns.query({ select: {} })).toEqual([]);
  expect(await reopened.entities.modelSteps.query({ select: {} })).toEqual([]);
  expect(await reopened.entities.toolExecutions.query({ select: {} })).toEqual([]);
});

test('missing metadata stays absent and explicit null input stays null', async () => {
  await using db = await openDatabase({ schema: chatSchema, storage: createMemoryStorage() });
  const messages = await db.transaction(async (tx) => {
    const exchange = await appendExchange(tx);
    for (const [position, input] of [undefined, null, { methods: ['imported'] }].entries()) {
      // biome-ignore lint/performance/noAwaitInLoops: Transaction mutations retain supplied order.
      await appendRetainedContribution(tx, exchange, {
        position,
        message: {
          kind: 'message',
          role: 'user',
          at,
          text: 'Sample',
          ...(input !== undefined && { input }),
        },
        provenance: {},
      });
    }
    return projectedExchange(tx, exchange);
  });
  expect(messages[0]).not.toHaveProperty('input');
  expect(messages[1]).toHaveProperty('input', null);
  expect(messages[2]).toHaveProperty('input', { methods: ['imported'] });
});

test('native submitted input metadata is available in the Conversation projection', async () => {
  await using db = await openDatabase({ schema: chatSchema, storage: createMemoryStorage() });
  const input = { methods: ['typed'], language: 'en' };
  const messages = await db.transaction(async (tx) => {
    const author = await tx.entities.actors.insert({ name: 'Sample user', kind: 'user' });
    const actor = await tx.entities.actors.insert({ name: 'Sample agent', kind: 'agent' });
    const agent = await tx.entities.agents.insert({
      actor,
      provider: 'sample',
      model: 'sample-model',
      instructions: 'Sample',
      settings: {},
      tools: [],
    });
    const accepted = await submitChat(tx, {
      author,
      agent,
      submission: 'sample',
      text: 'Sample',
      at: new Date(at),
      input,
    });
    return projectedExchange(tx, accepted.exchange);
  });
  expect(messages[0]).toHaveProperty('input', input);
});

test('retained metadata validation rejects invented malformed usage without accepting records', async () => {
  await using db = await openDatabase({ schema: chatSchema, storage: createMemoryStorage() });
  const exchange = await db.transaction((tx) => appendExchange(tx));
  await expect(
    db.transaction((tx) =>
      appendRetainedContribution(tx, exchange, {
        position: 0,
        provenance: {},
        message: {
          kind: 'message',
          role: 'agent',
          at,
          status: 'complete',
          parts: [],
          tokens: { in: -1, out: 2 },
        },
      }),
    ),
  ).rejects.toThrow();
  expect(await db.entities.retainedSources.query({ select: {} })).toEqual([]);
});

test('Conversation controller reading retains supplied metadata without requiring UI display', async () => {
  const { db, options } = await chatFixture();
  await using _db = db;
  await db.transaction(async (tx) => {
    const exchange = await appendExchange(tx);
    await appendRetainedContribution(tx, exchange, {
      position: 0,
      provenance: {},
      message: { kind: 'message', role: 'user', at, text: 'Sample', input: null },
    });
    await appendRetainedContribution(tx, exchange, {
      position: 1,
      provenance: {},
      message: {
        kind: 'message',
        role: 'agent',
        at,
        status: 'complete',
        parts: [],
        model: null,
        tokens: { in: 0, out: 0 },
      },
    });
  });
  const controller = createConversation(options);
  try {
    await controller.reload();
    expect(controller.snapshot().turns[0]).toHaveProperty('input', null);
    expect(controller.snapshot().turns[1]).toMatchObject({
      model: null,
      tokens: { in: 0, out: 0 },
    });
  } finally {
    controller.dispose();
  }
});
