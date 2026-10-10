import { expect, test } from 'vitest';
import { historyModelMessages } from '../../agent/history.ts';
import { chatModelMessages } from './node-backend.ts';

test('provider history preserves successful, failed and uncertain tool outcomes consistently for text and voice', () => {
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
      callId: 'unknown',
      name: 'publish',
      input: {},
      status: 'running' as const,
    },
  ];
  const voice = historyModelMessages([{ role: 'agent', parts }]);
  const text = chatModelMessages([
    {
      version: {
        key: { node: 'response', transaction: 'accepted' },
        data: null,
        placement: null,
        connection: null,
      },
      data: {
        kind: 'message',
        role: 'agent',
        status: 'running',
        at: '2026-10-10T12:00:00Z',
        parts,
      },
    },
  ]);
  expect(text).toEqual(voice);
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
        toolCallId: 'unknown',
        toolName: 'publish',
        output: { type: 'error-text', value: 'Outcome is uncertain; do not repeat this tool.' },
      },
    ],
  ]);
});
