import { expect, test, vi } from 'vitest';
import { createPersistentStorage, e, openDatabase, type Journal } from '@/core/store/index.ts';
import { SourceDocument } from '@/modules/sources/index.ts';
import {
  agentSchema,
  recordAgentRun,
  reviseRecordedAgentRun,
  readAgentActivity,
  executeEavRun,
} from './index.ts';
import { readAgentRun, startToolExecution, finishAgentRun } from './operations.ts';
import { Agent, AgentRun, ToolDefinition } from './records.ts';
import { Actor } from '@/modules/actors/index.ts';

const schema = e.registry({ ...agentSchema, sources: SourceDocument });
const value = {
  startedAt: new Date('2026-10-13T18:44:48.797Z'),
  status: 'running' as const,
  provider: 'recorded-provider',
  requestedModel: 'recorded-model',
  instructions: 'Exact supplied instructions',
  settings: { maxSteps: 12, external: null },
};
const inputs = [
  {
    position: 0,
    role: 'system' as const,
    transformation: 'verbatim' as const,
    content: value.instructions,
  },
  {
    position: 1,
    role: 'user' as const,
    transformation: 'generated' as const,
    content: { message: { role: 'user', content: 'Recorded question' } },
  },
];

function journalFixture() {
  let journal: Journal = { schemas: [], commits: [] };
  return () =>
    createPersistentStorage({
      scope: 'retained-runs-test',
      load: async () => structuredClone(journal),
      append: async (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
      },
    });
}

async function original(db: Awaited<ReturnType<typeof openDatabase<typeof schema>>>) {
  const records = await db.transaction(async (tx) => ({
    agentActor: await tx.entities.actors.insert({ name: 'Original agent', kind: 'agent' }),
    author: await tx.entities.actors.insert({ name: 'Original owner', kind: 'user' }),
    source: await tx.entities.sources.insert({
      key: 'run-source',
      title: 'Original run',
      text: 'Recorded activity',
      origin: 'external',
      attribution: 'Source owner',
      capturedAt: new Date(),
      available: true,
    }),
  }));
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  return {
    ...records,
    provenance: await db.history.retainedStateReference(snapshot, records.source),
  };
}

test('Actor-only original runs retain configuration, ordered inputs and subsequent states after independent reopen', async () => {
  const storage = journalFixture();
  const db = await openDatabase({ schema, storage: storage() });
  const origin = await original(db);
  const recorded = await db.transaction((tx) =>
    recordAgentRun(tx, {
      ...origin,
      value,
      inputs: [...inputs].reverse(),
      tools: [{ name: 'originalTool', versionStatus: 'unknown' }],
    }),
  );
  const accepted = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const address = await db.history.retainedStateReference(accepted, recorded.run);
  const complete = {
    ...value,
    status: 'complete' as const,
    endedAt: new Date('2026-10-13T18:44:55.685Z'),
    elapsedMs: 3749,
    usage: null,
    output: { text: 'Recorded result' },
  };
  await db.transaction((tx) =>
    reviseRecordedAgentRun(tx, recorded.run, complete, origin.provenance),
  );
  await db[Symbol.asyncDispose]();
  await using reopened = await openDatabase({ schema, storage: storage() });
  const currentRun = (await reopened.entities.agentRuns.first({ select: {} }))!;
  const selected = await reopened.history.resolveRetainedState(address);
  const run = await readAgentRun(reopened, currentRun);
  expect(run).toMatchObject({
    ...complete,
    provenance: origin.provenance,
    tools: [{ name: 'originalTool', versionStatus: 'unknown' }],
    inputs,
  });
  expect(run?.agent).toBeUndefined();
  expect(run?.agentActor?.name).toBe('Original agent');
  expect(run?.author.name).toBe('Original owner');
  expect(run?.firstOutputMs).toBeUndefined();
  expect(run?.steps).toEqual([]);
  const historicalView = reopened.at(selected.transaction);
  const historicalRef = (await historicalView.entities.agentRuns.first({ select: {} }))!;
  const historical = await readAgentRun(historicalView, historicalRef);
  expect(historical?.status).toBe('running');
  expect(historical?.endedAt).toBeUndefined();
  expect((await readAgentActivity(reopened, currentRun))?.parts).toEqual([
    { kind: 'text', text: 'Recorded result' },
  ]);
  expect(await reopened.entities.agents.query({ select: {} })).toEqual([]);
  expect(await reopened.entities.toolDefinitions.query({ select: {} })).toEqual([]);
});

test('running retained activity cannot invoke a provider or admit live tool execution', async () => {
  const storage = journalFixture();
  await using db = await openDatabase({ schema, storage: storage() });
  const origin = await original(db);
  const recorded = await db.transaction((tx) =>
    recordAgentRun(tx, {
      ...origin,
      value,
      inputs,
      tools: [{ name: 'originalTool', version: 'known' }],
    }),
  );
  const provider = vi.fn();
  const tools = vi.fn();
  const handle = executeEavRun({ db, run: recorded.run, execution: provider, tools });
  expect((await handle.done).phase).toBe('failed');
  await expect(
    db.transaction((tx) =>
      finishAgentRun(tx, recorded.run, {
        status: 'complete',
        endedAt: new Date(),
      }),
    ),
  ).rejects.toThrow('Only a running Agent run can finish');
  expect(provider).not.toHaveBeenCalled();
  expect(tools).not.toHaveBeenCalled();
  await expect(
    db.transaction((tx) =>
      startToolExecution(tx, recorded.tools[0]!, {
        call: 'new',
        startedAt: new Date(),
        input: {},
      }),
    ),
  ).rejects.toThrow('Tool execution requires a running run');
  expect((await readAgentActivity(db, recorded.run))?.status).toBe('running');
  expect(await db.entities.toolExecutions.query({ select: {} })).toEqual([]);
  handle.dispose();
});

test('journals with required configured Agent references open under the widened retained-run schema', async () => {
  const storage = journalFixture();
  const { agentActor: _actor, provenance: _provenance, ...fields } = AgentRun.fields;
  const oldRun = e.entity('agent.run', { ...fields, agent: e.ref(Agent) });
  const oldSchema = e.registry({
    actors: Actor,
    agents: Agent,
    toolDefinitions: ToolDefinition,
    runs: oldRun,
  });
  const old = await openDatabase({ schema: oldSchema, storage: storage() });
  await old.transaction(async (tx) => {
    const actor = await tx.entities.actors.insert({ name: 'Configured agent', kind: 'agent' });
    const agent = await tx.entities.agents.insert({
      actor,
      provider: 'p',
      model: 'm',
      instructions: '',
      settings: {},
      tools: [],
    });
    return tx.entities.runs.insert({ ...value, agent, author: actor });
  });
  await old[Symbol.asyncDispose]();
  await using reopened = await openDatabase({ schema, storage: storage() });
  const run = (await reopened.entities.agentRuns.first({ select: {} }))!;
  expect(await readAgentRun(reopened, run)).toMatchObject(value);
});
