import { transactionFixture } from '../vault/transactions/fixtures.test-support.ts';
import { expect, test } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import { create, request } from '../vault/nodes/fixtures.test-support.ts';
import { nodeOperations } from '../vault/nodes/operations.ts';
import { readAgentRun } from './store.ts';
import { prepareAgentRunFixture as prepareAgentRun } from './preparation.test-support.ts';
import { createAgentBackend } from './runtime.ts';

test('an external voice provider executes through accepted Agent context and durable module tools', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('seed', [create('user', { kind: 'actor' }), create('agent', { kind: 'agent' })]),
  );
  const prepared = await prepareAgentRun(nodes, {
    id: 'start',
    run: 'run',
    agent: 'agent',
    recordedBy: 'user',
    at: '2026-10-10T12:00:00Z',
    provider: 'fictional-voice',
    model: 'voice',
    settings: {},
    enabledTools: [{ name: 'capture' }],
    context: [
      {
        data: {
          kind: 'contextInput',
          role: 'user',
          position: 0,
          transformation: 'verbatim',
          content: 'Capture this.',
        },
      },
    ],
  });
  const backend = createAgentBackend({
    nodes: transactionFixture(nodes),
    execution: async ({ messages, tools, signal }) => {
      expect((await readAgentRun(nodes, 'run'))?.data.status).toBe('running');
      expect(messages).toEqual([{ role: 'user', content: 'Capture this.' }]);
      const definition = tools.capture!;
      if (definition.type === 'provider' || !definition.execute)
        throw new Error('Expected executable tool');
      const output = await definition.execute(
        {},
        { toolCallId: 'call', messages: [...messages], abortSignal: signal, context: {} },
      );
      return { status: 'complete', text: 'Captured.', output: { receipt: output } };
    },
    writableKinds: ['paragraph'],
    tools: (context) => ({
      capture: tool({
        inputSchema: z.object({}),
        execute: async () => {
          expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data.status).toBe('running');
          return await context.write((id) => ({
            id,
            kind: nodeOperations.create,
            message: null,
            changes: [create('paragraph', { kind: 'paragraph', text: 'Captured' })],
          }));
        },
      }),
    }),
  });
  expect((await backend.start(prepared).done).phase).toBe('complete');
  expect((await readAgentRun(nodes, 'run'))?.data.output).toMatchObject({
    text: 'Captured.',
    receipt: (await nodes.snapshot()).get('paragraph')!.key.transaction,
  });
  expect((await readAgentRun(nodes, 'run'))?.tools[0]?.data.status).toBe('complete');
});
