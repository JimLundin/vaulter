import { expect, test } from 'vitest';
import { historyModelMessages } from '@/agent/history.ts';

test('provider history preserves successful, failed, cancelled and uncertain tool outcomes in recorded provider history', () => {
  const parts = [
    {
      kind: 'tool' as const,
      callId: 'ok',
      name: 'publish',
      input: {},
      status: 'complete' as const,
      output: { transaction: 'accepted' },
    },
    {
      kind: 'tool' as const,
      callId: 'bad',
      name: 'publish',
      input: {},
      status: 'failed' as const,
      error: 'Rejected',
    },
    {
      kind: 'tool' as const,
      callId: 'cancelled',
      name: 'publish',
      input: {},
      status: 'cancelled' as const,
      error: 'Stopped',
    },
    {
      kind: 'tool' as const,
      callId: 'unknown',
      name: 'publish',
      input: {},
      status: 'running' as const,
    },
  ];
  const voice = historyModelMessages([{ role: 'agent', parts }]);
  expect(
    voice.filter((message) => message.role === 'tool').map((message) => message.content),
  ).toEqual([
    [
      {
        type: 'tool-result',
        toolCallId: 'ok',
        toolName: 'publish',
        output: { type: 'json', value: { transaction: 'accepted' } },
      },
    ],
    [
      {
        type: 'tool-result',
        toolCallId: 'bad',
        toolName: 'publish',
        output: { type: 'error-text', value: 'Rejected' },
      },
    ],
    [
      {
        type: 'tool-result',
        toolCallId: 'cancelled',
        toolName: 'publish',
        output: { type: 'error-text', value: 'Stopped' },
      },
    ],
    [
      {
        type: 'tool-result',
        toolCallId: 'unknown',
        toolName: 'publish',
        output: { type: 'error-text', value: 'Outcome is uncertain; do not repeat this tool.' },
      },
    ],
  ]);
});
