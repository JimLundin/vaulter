import { expect, test, vi } from 'vitest';
import { createMemoryStorage, openDatabase } from '@/vault/eav/index.ts';
import { agentSchema } from './data/schema.ts';
import { startAgentRun } from './data/operations.ts';
import { executeEavRun } from './eav/runtime.ts';
import { readAgentActivity } from './reading.ts';

async function fixture() {
  const db = await openDatabase({ schema: agentSchema, storage: createMemoryStorage() });
  const { run } = await db.transaction(async (tx) => {
    const actor = await tx.entities.actors.insert({ kind: 'agent', name: 'Agent' });
    const agent = await tx.entities.agents.insert({
      actor,
      provider: 'fixture',
      model: 'model',
      instructions: '',
      settings: {},
      tools: [],
    });
    return startAgentRun(tx, { agent, startedAt: new Date(), inputs: [] });
  });
  return { db, run };
}

test('recorded activity preserves text and tool order and unfinished requests without effects', async () => {
  const { db, run } = await fixture();
  await using _db = db;
  await db.transaction(async (tx) => {
    const step = await tx.entities.modelSteps.insert({
      run,
      position: 0,
      startedAt: new Date(),
      status: 'complete',
      inputFormat: 'ai-sdk-model-messages-v7',
      input: [],
      configuration: {},
      response: {
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Before' },
              { type: 'tool-call', toolCallId: 'call', toolName: 'inspect', input: {} },
              { type: 'text', text: 'After' },
            ],
          },
        ],
      },
    });
    const tool = await tx.entities.runTools.insert({ run, name: 'inspect', version: 'v1' });
    await tx.entities.toolExecutions.insert({
      tool,
      step,
      position: 0,
      call: 'call',
      attempt: 1,
      startedAt: new Date(),
      status: 'complete',
      input: {},
      output: { answer: 42 },
    });
    await tx.entities.modelSteps.insert({
      run,
      position: 1,
      startedAt: new Date(),
      status: 'running',
      inputFormat: 'ai-sdk-model-messages-v7',
      input: [],
      configuration: {},
    });
  });
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  expect((await readAgentActivity(db.at(snapshot), run))?.parts).toEqual([
    { kind: 'text', text: 'Before' },
    {
      kind: 'tool',
      callId: 'call',
      name: 'inspect',
      version: 'v1',
      input: {},
      status: 'complete',
      output: { answer: 42 },
    },
    { kind: 'text', text: 'After' },
  ]);
});

test('malformed recorded responses fail reading rather than silently dropping text', async () => {
  const { db, run } = await fixture();
  await using _db = db;
  await db.transaction((tx) =>
    tx.entities.modelSteps.insert({
      run,
      position: 0,
      startedAt: new Date(),
      status: 'complete',
      inputFormat: 'ai-sdk-model-messages-v7',
      input: [],
      configuration: {},
      response: { obsolete: 'shape' },
    }),
  );
  await expect(readAgentActivity(db, run)).rejects.toThrow('Invalid Agent model response');
});

test('reading opaque current execution output never invokes the provider again', async () => {
  const { db, run } = await fixture();
  await using _db = db;
  const provider = vi.fn(async () => ({ status: 'complete' as const, text: 'Retained output' }));
  const handle = executeEavRun({ db, run, execution: provider });
  await handle.done;
  expect(await readAgentActivity(db, run)).toMatchObject({
    status: 'complete',
    parts: [{ kind: 'text', text: 'Retained output' }],
  });
  expect(await readAgentActivity(db, run)).toMatchObject({
    parts: [{ kind: 'text', text: 'Retained output' }],
  });
  expect(provider).toHaveBeenCalledOnce();
  handle.dispose();
});
