import { expect, test } from 'vitest';
import { openDatabase, sameEntity, createMemoryStorage } from '../../../vault/eav/index.ts';
import {
  startAgentRun,
  finishAgentRun,
  startToolExecution,
  finishToolExecution,
  readAgentRun,
} from '../../../agent/data/operations.ts';
import { chatSchema } from './schema.ts';
import {
  createConversation,
  submitChat,
  recordResponse,
  recordSummary,
  readExchange,
} from './operations.ts';

const at = (seconds = 0) => new Date(Date.UTC(2026, 9, 17, 12, 0, seconds));
async function setup() {
  const storage = createMemoryStorage();
  const db = await openDatabase({ schema: chatSchema, storage });
  const fixtures = await db.transaction(async (tx) => {
    const user = await tx.entities.actors.insert({ name: 'Jim', kind: 'user' });
    const actor = await tx.entities.actors.insert({ name: 'Assistant', kind: 'agent' });
    const tool = await tx.entities.toolDefinitions.insert({ name: 'read', version: '1' });
    const agent = await tx.entities.agents.insert({
      actor,
      provider: 'test',
      model: 'test-model',
      instructions: 'Be helpful.',
      settings: { temperature: 0.2 },
      tools: [tool],
    });
    const conversation = await createConversation(tx, { title: 'Travel', createdAt: at() });
    return { user, actor, agent, conversation, tool };
  });
  return { db, storage, ...fixtures };
}

test('accepts chat and independent Agent records atomically with copied effective inputs', async () => {
  const { db, user, actor, agent, conversation } = await setup();
  await using _handle = db;
  const submitted = await db.transaction({ author: user, origin: conversation }, (tx) =>
    submitChat(tx, { conversation, author: user, agent, text: 'Where next?', at: at() }),
  );
  const initial = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const changes = await db.history.changes(initial);
  expect(changes.map((change) => change.type)).toEqual(
    expect.arrayContaining([
      'exchanges',
      'messages',
      'agentRuns',
      'contextInputs',
      'runTools',
      'inputSources',
    ]),
  );
  await db.transaction((tx) =>
    tx.entities.agents.update({
      ...agent,
      instructions: 'Changed',
      model: 'new-model',
      settings: { temperature: 1 },
    }),
  );
  const recorded = await db.transaction((tx) => readAgentRun(tx, submitted.run));
  expect(recorded).toMatchObject({
    status: 'running',
    requestedModel: 'test-model',
    settings: { temperature: 0.2 },
    inputs: [
      { role: 'system', content: 'Be helpful.' },
      { role: 'user', content: 'Where next?' },
    ],
  });
  expect(sameEntity(submitted.run.author, actor)).toBe(true);
  const historical = await readExchange(db.at(initial), submitted.exchange);
  expect(historical?.messages.map((message) => message?.role)).toEqual(['user', 'agent']);
  expect(historical?.messages[1]?.status).toBe('running');
  const standalone = await db.transaction((tx) =>
    startAgentRun(tx, { agent, startedAt: at(1), inputs: [] }),
  );
  expect(sameEntity(standalone.run, submitted.run)).toBe(false);
  expect(
    await db.entities.messages.query({ where: { run: { eq: standalone.run } }, select: {} }),
  ).toEqual([]);
});

test('records tool outcomes once, preserves response part order and reads after reopening', async () => {
  const { db, storage, user, agent, conversation } = await setup();
  await using _handle = db;
  const submitted = await db.transaction((tx) =>
    submitChat(tx, { conversation, author: user, agent, text: 'Read this', at: at() }),
  );
  const tool = await db.transaction((tx) =>
    startToolExecution(tx, submitted.tools[0]!, {
      call: 'call-1',
      startedAt: at(1),
      input: { path: 'notes' },
    }),
  );
  await expect(
    db.transaction((tx) =>
      finishAgentRun(tx, submitted.run, { status: 'complete', endedAt: at(2) }),
    ),
  ).rejects.toThrow('pending tool');
  await db.transaction((tx) =>
    finishToolExecution(tx, tool, {
      status: 'complete',
      endedAt: at(2),
      output: { text: 'Hello' },
    }),
  );
  await expect(
    db.transaction((tx) =>
      finishToolExecution(tx, tool, { status: 'complete', endedAt: at(3), output: 'Overwrite' }),
    ),
  ).rejects.toThrow('Only a running tool');
  await db.transaction((tx) =>
    finishAgentRun(tx, submitted.run, {
      status: 'complete',
      endedAt: at(3),
      output: { text: 'Done' },
      inputTokens: 10,
      outputTokens: 2,
    }),
  );
  await db.transaction((tx) =>
    recordResponse(tx, submitted.response, [
      { kind: 'text', text: 'Looking…' },
      { kind: 'tool', execution: tool },
      { kind: 'text', text: 'Done' },
    ]),
  );
  await expect(db.transaction((tx) => recordResponse(tx, submitted.response, []))).rejects.toThrow(
    'already recorded',
  );
  await using reopened = await openDatabase({ schema: chatSchema, storage });
  const exchange = await reopened.transaction((tx) => readExchange(tx, submitted.exchange));
  const response = exchange?.messages[1];
  expect(response?.status).toBe('complete');
  expect(response?.parts.map((part) => part.kind)).toEqual(['text', 'tool', 'text']);
  expect(response?.parts[1]).toMatchObject({
    execution: {
      tool: { name: 'read', version: '1' },
      input: { path: 'notes' },
      output: { text: 'Hello' },
    },
  });
});

test('bad submissions and foreign run receipts leave no partial chat records', async () => {
  const { db, user, actor, agent, conversation } = await setup();
  await using _handle = db;
  await expect(
    db.transaction((tx) =>
      submitChat(tx, { conversation, author: actor, agent, text: 'No', at: at() }),
    ),
  ).rejects.toThrow('user author');
  expect(await db.entities.exchanges.query({ select: {} })).toHaveLength(0);
  const first = await db.transaction((tx) =>
    submitChat(tx, { conversation, author: user, agent, text: 'One', at: at() }),
  );
  const second = await db.transaction((tx) =>
    submitChat(tx, { conversation, author: user, agent, text: 'Two', at: at() }),
  );
  const tool = await db.transaction((tx) =>
    startToolExecution(tx, second.tools[0]!, { call: 'call', startedAt: at(1), input: null }),
  );
  await db.transaction(async (tx) => {
    await finishToolExecution(tx, tool, { status: 'complete', endedAt: at(2), output: null });
    await finishAgentRun(tx, first.run, { status: 'stopped', endedAt: at(3) });
  });
  await expect(
    db.transaction((tx) =>
      recordResponse(tx, first.response, [
        { kind: 'text', text: 'Partial' },
        { kind: 'tool', execution: tool },
      ]),
    ),
  ).rejects.toThrow('own run');
  expect(
    await db.entities.textParts.query({ where: { message: { eq: first.response } }, select: {} }),
  ).toEqual([]);
  expect(
    await db.entities.messages.get(first.response, { select: { status: true } }),
  ).toMatchObject({ status: 'running' });
  expect(
    (
      await db.entities.exchanges.query({
        select: { position: true },
        orderBy: [{ position: 'asc' }],
      })
    ).map((item) => item.position),
  ).toEqual([0, 1]);
});

test('retains summaries without inventing authors or an Agent run', async () => {
  const { db, conversation } = await setup();
  await using _handle = db;
  const summary = await db.transaction((tx) =>
    recordSummary(tx, { conversation, at: at(), text: 'A retained summary', label: 'Meeting' }),
  );
  const result = await db.transaction((tx) => readExchange(tx, summary.exchange));
  expect(result?.messages[0]).toMatchObject({
    role: 'record',
    label: 'Meeting',
    parts: [{ kind: 'text', text: 'A retained summary' }],
  });
  expect(result?.messages[0]?.author).toBeUndefined();
  expect(await db.entities.agentRuns.first({ select: {} })).toBeUndefined();
});
