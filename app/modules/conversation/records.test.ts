import { expect, test } from 'vitest';
import { openDatabase, sameEntity, createMemoryStorage } from '@/core/store/index.ts';
import {
  startAgentRun,
  finishAgentRun,
  startToolExecution,
  finishToolExecution,
  readAgentRun,
} from '@/modules/agent/operations.ts';
import { chatSchema } from './records.ts';
import { conversation as getConversation, submitChat, readExchange } from './submission.ts';

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
    const conversation = await getConversation(tx);
    return { user, actor, agent, conversation, tool };
  });
  return { db, storage, ...fixtures };
}

test('topic and date changes append to one authoritative dialogue with canonical Agent output', async () => {
  const { db, user, actor, agent, conversation, storage } = await setup();
  await using _db = db;
  const first = await db.transaction({ author: user, origin: conversation }, (tx) =>
    submitChat(tx, { submission: 'one', author: user, agent, text: 'Travel', at: at() }),
  );
  const accepted = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await db.transaction((tx) =>
    finishAgentRun(tx, first.run, {
      status: 'complete',
      endedAt: at(1),
      output: { text: 'A response' },
    }),
  );
  const second = await db.transaction((tx) =>
    submitChat(tx, {
      submission: 'two',
      author: user,
      agent,
      text: 'A different topic',
      at: new Date('2027-01-01'),
    }),
  );
  expect(await db.entities.conversations.query({ select: {} })).toHaveLength(1);
  const exchanges = await db.entities.exchanges.query({
    select: { conversation: true, position: true },
    orderBy: [{ position: 'asc' }],
  });
  expect(exchanges.map((item) => item.position)).toEqual([0, 1]);
  expect(exchanges.every((item) => sameEntity(item.conversation, conversation))).toBe(true);
  expect(await db.entities.messages.query({ select: {} })).toHaveLength(2);
  expect(sameEntity(first.run.author, actor)).toBe(true);
  expect(sameEntity(first.run, second.run)).toBe(false);
  expect((await readExchange(db.at(accepted), first.exchange))?.execution?.status).toBe('running');
  await using reopened = await openDatabase({ schema: chatSchema, storage });
  const retained = await reopened.transaction((tx) => readExchange(tx, first.exchange));
  expect(retained?.messages).toHaveLength(1);
  expect(retained?.execution).toMatchObject({
    status: 'complete',
    parts: [{ kind: 'text', text: 'A response' }],
  });
});

test('repeated admission and invalid authors create no additional records', async () => {
  const { db, user, actor, agent } = await setup();
  await using _db = db;
  const input = { submission: 'same', author: user, agent, text: 'Hello', at: at() };
  await expect(db.transaction((tx) => submitChat(tx, { ...input, author: actor }))).rejects.toThrow(
    'user author',
  );
  expect(await db.entities.exchanges.query({ select: {} })).toHaveLength(0);
  await db.transaction((tx) => submitChat(tx, input));
  await expect(db.transaction((tx) => submitChat(tx, input))).rejects.toThrow('already accepted');
  expect(await db.entities.exchanges.query({ select: {} })).toHaveLength(1);
  expect(await db.entities.messages.query({ select: {} })).toHaveLength(1);
  expect(await db.entities.agentRuns.query({ select: {} })).toHaveLength(1);
});

test('standalone Agent runs retain effective configuration and canonical tool outcomes', async () => {
  const { db, agent } = await setup();
  await using _db = db;
  const started = await db.transaction((tx) =>
    startAgentRun(tx, { agent, startedAt: at(), inputs: [] }),
  );
  await db.transaction((tx) =>
    tx.entities.agents.update({ ...agent, model: 'Changed', instructions: 'Changed' }),
  );
  const tool = await db.transaction((tx) =>
    startToolExecution(tx, started.tools[0]!, {
      call: 'one',
      startedAt: at(1),
      input: { path: 'notes' },
    }),
  );
  await expect(
    db.transaction((tx) => finishAgentRun(tx, started.run, { status: 'complete', endedAt: at(2) })),
  ).rejects.toThrow('pending tool');
  await db.transaction((tx) =>
    finishToolExecution(tx, tool, { status: 'complete', endedAt: at(2), output: 'Retained' }),
  );
  await expect(
    db.transaction((tx) =>
      finishToolExecution(tx, tool, { status: 'complete', endedAt: at(3), output: 'Overwrite' }),
    ),
  ).rejects.toThrow('Only a running tool');
  await db.transaction((tx) =>
    finishAgentRun(tx, started.run, { status: 'complete', endedAt: at(3) }),
  );
  expect(await db.transaction((tx) => readAgentRun(tx, started.run))).toMatchObject({
    requestedModel: 'test-model',
    instructions: 'Be helpful.',
    executions: [{ output: 'Retained' }],
  });
  expect(await db.entities.exchanges.query({ select: {} })).toHaveLength(0);
});
