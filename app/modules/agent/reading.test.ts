import { expect, test, vi } from 'vitest';
import { createMemoryStorage, openDatabase } from '@/core/store/index.ts';
import { agentSchema } from './records.ts';
import { recordRunTool, startAgentRun, startToolExecution } from './operations.ts';
import { executeEavRun } from './execution/runtime.ts';
import { readAgentActivity } from './reading.ts';

async function fixture(storage = createMemoryStorage()) {
  const db = await openDatabase({ schema: agentSchema, storage });
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

test('unknown and known historical tool versions survive reopen without fabricated model steps', async () => {
  const storage = createMemoryStorage();
  const { db, run } = await fixture(storage);
  await db.transaction(async (tx) => {
    for (const [position, version] of [
      { versionStatus: 'unknown' as const },
      { version: 'v1' },
    ].entries()) {
      const tool = await recordRunTool(tx, run, { name: `inspect${position}`, ...version });
      await tx.entities.toolExecutions.insert({
        tool,
        position,
        call: `call${position}`,
        attempt: 1,
        startedAt: new Date(),
        status: 'complete',
        input: { historical: true },
        output: { answer: position },
      });
    }
  });
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await db[Symbol.asyncDispose]();
  await using reopened = await openDatabase({ schema: agentSchema, storage });
  const historical = await readAgentActivity(reopened.at(snapshot), run);
  expect(historical?.parts).toMatchObject([
    { kind: 'tool', name: 'inspect0', versionStatus: 'unknown', output: { answer: 0 } },
    { kind: 'tool', name: 'inspect1', version: 'v1', output: { answer: 1 } },
  ]);
  expect(historical?.parts[0]).not.toHaveProperty('version', expect.any(String));
  expect(await readAgentActivity(reopened, run)).toEqual(historical);
  expect(await reopened.entities.modelSteps.query({ select: {} })).toEqual([]);
});

test('owner admission rejects missing, blank and contradictory historical versions', async () => {
  const { db, run } = await fixture();
  await using _db = db;
  await expect(
    db.transaction((tx) => recordRunTool(tx, run, { name: 'inspect', version: ' ' })),
  ).rejects.toThrow();
  // Generic EAV writes validate structure; the owner reader must reject ambiguous imported states.
  await db.transaction((tx) =>
    tx.entities.runTools.insert({
      run,
      name: 'inspect',
      version: 'v1',
      versionStatus: 'unknown',
    }),
  );
  await expect(readAgentActivity(db, run)).rejects.toThrow(
    'Unknown tool version cannot include a version',
  );
});

test('new tool execution rejects unknown historical versions before accepting an invocation', async () => {
  const { db, run } = await fixture();
  await using _db = db;
  const tool = await db.transaction((tx) =>
    recordRunTool(tx, run, {
      name: 'inspect',
      versionStatus: 'unknown',
    }),
  );
  await expect(
    db.transaction((tx) =>
      startToolExecution(tx, tool, {
        call: 'new-call',
        startedAt: new Date(),
        input: {},
      }),
    ),
  ).rejects.toThrow('Live tools require a known version');
  expect(await db.entities.toolExecutions.query({ select: {} })).toEqual([]);
});
