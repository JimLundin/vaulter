import { expect, test, vi } from 'vitest';
import { snapshotOf, differences, validateRecords, validateRecordsAsync } from './history.ts';
import { nodeOperations } from './operations.ts';
import type { NodeRecord } from './validation.ts';

function history(count: number): NodeRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    format: 1,
    requestDigest: '0'.repeat(64),
    transaction: {
      id: `transaction-${index}`,
      sequence: index + 1,
      recordedAt: '2026-10-12T10:00:00Z',
      recordedBy: 'user',
      origin: null,
      undoOf: null,
      message: null,
      kind: nodeOperations.update,
    },
    versions: [
      {
        key: { node: 'user', transaction: `transaction-${index}` },
        data: { kind: 'actor', name: `User ${index}` },
        placement: null,
        connection: null,
      },
    ],
  }));
}

test('loading history does not rebuild exact-version keys for every accepted prefix', () => {
  const records = history(200);
  // Count exact-version key encoding: replay encodes all preceding versions again.
  const stringify = vi.spyOn(JSON, 'stringify');
  let loaded: readonly NodeRecord[];
  let encodings: number;
  try {
    loaded = validateRecords(records);
    encodings = stringify.mock.calls.filter(
      ([value]) => Array.isArray(value) && value.length === 2 && value[0] === 'user',
    ).length;
  } finally {
    stringify.mockRestore();
  }
  expect(loaded).toHaveLength(200);
  expect(loaded.at(-1)?.versions[0].data?.name).toBe('User 199');
  expect(encodings).toBeLessThanOrEqual(records.length * 4);
});

test('async history validation lets browser tasks run before publishing the complete history', async () => {
  const records = history(100);
  let taskRan = false;
  const task = new Promise<void>((resolve) =>
    setTimeout(() => {
      taskRan = true;
      resolve();
    }, 0),
  );
  const pending = validateRecordsAsync(records);
  expect(taskRan).toBe(false);
  const loaded = await pending;
  expect(taskRan).toBe(true);
  expect(loaded).toEqual(validateRecords(records));
  expect(Object.isFrozen(loaded)).toBe(true);
  await task;
});

test('historical snapshots and differences reuse indexes while preserving exact cutoffs', () => {
  const records = validateRecords(history(100));
  const stringify = vi.spyOn(JSON, 'stringify');
  try {
    for (const record of records) {
      const view = snapshotOf(records, record.transaction.sequence);
      expect(view.get('user')?.key.transaction).toBe(record.transaction.id);
      expect(view.resolve({ node: 'user', transaction: 'transaction-99' })).toBe(
        record.transaction.sequence === 100 ? records[99].versions[0] : undefined,
      );
      expect(differences(records, record.transaction.id)[0].before).toBe(
        records[record.transaction.sequence - 2]?.versions[0] ?? null,
      );
    }
    const encodings = stringify.mock.calls.filter(([value]) => Array.isArray(value)).length;
    expect(encodings).toBe(0);
  } finally {
    stringify.mockRestore();
  }
});

test('failed imported suffixes leave accepted snapshots and histories intact', async () => {
  const previous = validateRecords(history(2));
  expect(validateRecords(structuredClone(previous), previous)).toEqual(previous);
  const view = snapshotOf(previous);
  const records = history(4);
  records[3] = {
    ...records[3],
    versions: [{ ...records[3].versions[0], placement: { parent: 'user', order: 'a' } }],
  };
  await expect(validateRecordsAsync(records, previous)).rejects.toThrow('Containment cycle');
  expect(view.get('user')?.data?.name).toBe('User 1');
  expect(
    snapshotOf(previous).resolve({ node: 'user', transaction: 'transaction-2' }),
  ).toBeUndefined();
  const extended = await validateRecordsAsync(history(4), previous);
  expect(extended[0]).toBe(previous[0]);
  expect(snapshotOf(extended).get('user')?.data?.name).toBe('User 3');
  expect(view.get('user')?.data?.name).toBe('User 1');
});

test('incremental import rejects malformed history and altered accepted prefixes', () => {
  const previous = validateRecords(history(2));
  expect(() => validateRecords(history(1), previous)).toThrow('removed');
  const rewritten = history(3);
  rewritten[0] = {
    ...rewritten[0],
    versions: [{ ...rewritten[0].versions[0], data: { name: 'Altered author' } }],
  };
  expect(() => validateRecords(rewritten, previous)).toThrow('rewritten');
  const gap = history(3);
  gap[2] = { ...gap[2], transaction: { ...gap[2].transaction, sequence: 4 } };
  expect(() => validateRecords(gap)).toThrow('Noncontiguous');
  const duplicate = history(3);
  duplicate[2] = {
    ...duplicate[2],
    transaction: { ...duplicate[2].transaction, id: 'transaction-0' },
    versions: [
      { ...duplicate[2].versions[0], key: { node: 'user', transaction: 'transaction-0' } },
    ],
  };
  expect(() => validateRecords(duplicate)).toThrow('Duplicate transaction');
  const missing = history(2);
  missing[1] = { ...missing[1], transaction: { ...missing[1].transaction, recordedBy: 'missing' } };
  expect(() => validateRecords(missing)).toThrow('Unknown transaction author');
  const mismatched = history(2);
  mismatched[1] = {
    ...mismatched[1],
    versions: [
      { ...mismatched[1].versions[0], key: { node: 'user', transaction: 'transaction-0' } },
    ],
  };
  expect(() => validateRecords(mismatched)).toThrow();
});
