import { tool } from 'ai';
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { createMemoryStorage, openDatabase, sameEntity } from '@/vault/eav/index.ts';
import { readAgentRun, startAgentRun } from './data/operations.ts';
import { agentSchema } from './data/schema.ts';
import { executeEavRun } from './eav/runtime.ts';

async function setup(tools: readonly { name: string; version: string }[] = []) {
  const db = await openDatabase({ schema: agentSchema, storage: createMemoryStorage() });
  const prepared = await db.transaction(async (tx) => {
    const actor = await tx.entities.actors.insert({ kind: 'agent', name: 'Assistant' });
    const enabled = await Promise.all(
      tools.map((definition) => tx.entities.toolDefinitions.insert(definition)),
    );
    const agent = await tx.entities.agents.insert({
      actor,
      provider: 'fixture',
      model: 'fixture-model',
      instructions: 'Be helpful.',
      settings: {},
      tools: enabled,
    });
    return { agent, actor };
  });
  const start = () =>
    db.transaction((tx) =>
      startAgentRun(tx, {
        agent: prepared.agent,
        startedAt: new Date(),
        inputs: [{ role: 'user', transformation: 'verbatim', content: 'Hello' }],
      }),
    );
  return { db, start, actor: prepared.actor };
}

test('independent EAV runs execute concurrently and historical reads never replay providers', async () => {
  const { db, start } = await setup();
  await using _db = db;
  const { run: first } = await start();
  const { run: second } = await start();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const execution = vi.fn(async () => {
    await waiting;
    return { status: 'complete' as const, text: 'Done' };
  });
  const a = executeEavRun({ db, run: first, execution });
  const b = executeEavRun({ db, run: second, execution });
  await vi.waitFor(() => expect(execution).toHaveBeenCalledTimes(2));
  expect(await readAgentRun(db, first)).toMatchObject({
    status: 'running',
    instructions: 'Be helpful.',
  });
  release();
  expect((await a.done).phase).toBe('complete');
  expect((await b.done).phase).toBe('unsaved');
  expect((await b.retrySave()).phase).toBe('complete');
  const history = await db.history.transactions.query({
    select: {},
    orderBy: [{ sequence: 'asc' }],
  });
  const at = db.at(history.at(-1)!);
  expect(await readAgentRun(at, first)).toMatchObject({
    status: 'complete',
    output: { text: 'Done' },
    steps: [],
  });
  expect(execution).toHaveBeenCalledTimes(2);
  a.dispose();
  b.dispose();
});

test('module effects start after a canonical invocation and completion is retained once for repeated provider calls', async () => {
  const { db, start, actor } = await setup([{ name: 'inspect', version: 'v1' }]);
  await using _db = db;
  const { run } = await start();
  const effect = vi.fn(async () => {
    const recorded = await readAgentRun(db, run);
    expect(recorded?.executions).toMatchObject([{ status: 'running', input: { query: 'hello' } }]);
    return { answer: 'retained' };
  });
  const handle = executeEavRun({
    db,
    run,
    tools: (context) => {
      expect(sameEntity(context.author, actor)).toBe(true);
      expect(sameEntity(context.run, run)).toBe(true);
      return { inspect: tool({ inputSchema: z.object({ query: z.string() }), execute: effect }) };
    },
    execution: async (input) => {
      const inspect = input.tools.inspect!;
      if (!inspect.execute || inspect.type === 'provider') throw new Error('Missing tool');
      const call = {
        toolCallId: 'call',
        messages: [...input.messages],
        abortSignal: input.signal,
        context: {},
      };
      expect(await inspect.execute({ query: 'hello' }, call)).toEqual({ answer: 'retained' });
      expect(await inspect.execute({ query: 'hello' }, call)).toEqual({ answer: 'retained' });
      return { status: 'complete', text: 'Inspected' };
    },
  });
  expect((await handle.done).phase).toBe('complete');
  expect(effect).toHaveBeenCalledOnce();
  expect((await readAgentRun(db, run))?.executions).toMatchObject([
    { status: 'complete', output: { answer: 'retained' } },
  ]);
  handle.dispose();
});

test('Stop interrupts a pending external provider and retains stopped output without replay', async () => {
  const { db, start } = await setup();
  await using _db = db;
  const { run } = await start();
  const execution = vi.fn(
    async () =>
      await new Promise<never>(() => {
        /* Provider remains pending until Stop. */
      }),
  );
  const handle = executeEavRun({ db, run, execution });
  await vi.waitFor(() => expect(execution).toHaveBeenCalledOnce());
  handle.stop();
  expect((await handle.done).phase).toBe('stopped');
  await handle.retrySave();
  expect(await readAgentRun(db, run)).toMatchObject({ status: 'stopped', output: { text: '' } });
  expect(execution).toHaveBeenCalledOnce();
  handle.dispose();
});
