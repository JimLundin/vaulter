import { expect, test } from 'vitest';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { create, request, revise } from '@/vault/nodes/fixtures.test-support.ts';
import { agentRunsIn, readAgentRunAt } from './reading.ts';

test('historical activity does not decode unrelated effective context or rewrite recorded run status', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('setup', [
      create('user', { kind: 'actor' }),
      create('origin', { kind: 'content' }),
      {
        ...create(
          'run',
          {
            kind: 'agentRun',
            started: '2026-10-10T12:00:00Z',
            status: 'running',
            provider: 'fictional',
            model: { requested: 'fictional' },
            settings: {},
            enabledTools: [],
          },
          'origin',
        ),
        connection: { source: { node: 'run', transaction: 'setup' }, target: { node: 'origin' } },
      },
      create('context', { kind: 'contextInput', futureProviderFormat: true }, 'run'),
    ]),
  );
  const historical = await nodes.snapshot();
  expect(() => readAgentRunAt(historical, 'run')).toThrow();
  expect(agentRunsIn(historical, 'origin', (id) => id === 'setup')).toMatchObject([
    {
      version: { key: { node: 'run', transaction: 'setup' } },
      data: { status: 'running' },
      tools: [],
    },
  ]);
  expect(agentRunsIn(historical, 'origin', () => false)).toEqual([]);
  await nodes.commit(
    request('later', [
      await revise(nodes, 'run', {
        ...historical.get('run')!.data!,
        status: 'complete',
        ended: '2026-10-10T12:01:00Z',
      }),
    ]),
  );
  expect(agentRunsIn(historical, 'origin', () => true)[0].data.status).toBe('running');
  expect(agentRunsIn(await nodes.snapshot(), 'origin', () => true)[0].data.status).toBe('complete');
  nodes.close();
});
