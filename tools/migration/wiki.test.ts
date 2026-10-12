import { expect, test } from 'vitest';
import { parseMigrationRecord } from './wiki.ts';

test('migration validates Chat metadata and Agent records with their owners while retaining full JSON', () => {
  const records = [
    {
      kind: 'attachment',
      name: 'Recording',
      mediaType: 'audio/webm',
      bytes: 20,
      sha256: '0'.repeat(64),
      retained: 'future field',
    },
    {
      kind: 'interpretation',
      category: 'summary',
      at: '2026-10-11T12:00:00Z',
      statement: 'Quiet mornings.',
      certainty: 'explicit',
      method: { name: 'review' },
      retained: 'future field',
    },
    {
      kind: 'contextInput',
      role: 'user',
      position: 0,
      transformation: 'verbatim',
      content: 'Quiet mornings.',
      retained: 'future field',
    },
    {
      kind: 'agentRun',
      started: '2026-10-11T12:00:00Z',
      status: 'complete',
      provider: 'fictional',
      model: { requested: 'fictional' },
      settings: {},
      enabledTools: [],
      retained: 'future field',
    },
    {
      kind: 'toolExecution',
      call: 'call-1',
      name: 'fictional',
      attempt: 1,
      started: '2026-10-11T12:00:00Z',
      status: 'complete',
      input: {},
      retained: 'future field',
    },
  ];
  for (const record of records) {
    const parsed = parseMigrationRecord(record);
    expect(parsed).toEqual(record);
    expect(parsed).not.toBe(record);
    expect(Object.isFrozen(parsed)).toBe(true);
  }
  expect(() => parseMigrationRecord({ kind: 'toolExecution', status: 'complete' })).toThrow();
});
