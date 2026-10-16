import { expect, test } from 'vitest';
import { create, request } from './fixtures.test-support.ts';

function record() {
  return {
    format: 1,
    requestDigest: '0123456789abcdef'.repeat(4),
    transaction: {
      id: 'import',
      sequence: 1,
      recordedAt: '2026-10-16T10:00:00+02:00',
      recordedBy: 'user',
      kind: { scope: 'future-feature', action: 'future-action' },
      message: null,
      origin: null,
      undoOf: null,
      metadata: { imported: true },
    },
    versions: [
      {
        key: { node: 'user', transaction: 'import' },
        data: { kind: 'actor' },
        placement: null,
        connection: null,
      },
      {
        key: { node: 'page', transaction: 'import' },
        data: { title: 'Imported page' },
        placement: { parent: 'user', order: 'a-long-order-key' },
        connection: {
          source: { node: 'page', transaction: 'import' },
          target: { node: 'user' },
        },
      },
    ],
  };
}

// Load ingress inside tests so schema-construction faults fail a test rather than
// preventing collection, which the mutation runner can misreport as a survivor.
test('import retains complete versions, offset timestamps and well-formed future transaction kinds', async () => {
  const { parseCommit, parseRecord } = await import('./validation.ts');
  const input = record();
  expect(parseRecord(input)).toEqual(input);
  expect(
    parseRecord({
      ...input,
      transaction: { ...input.transaction, sequence: Number.MAX_SAFE_INTEGER },
    }),
  ).toEqual({
    ...input,
    transaction: { ...input.transaction, sequence: Number.MAX_SAFE_INTEGER },
  });
  const changes = [create('user', { kind: 'actor' }), create('page', {}, 'user')];
  const proposed = {
    ...request('new', changes),
    changes: [
      changes[0],
      { ...changes[1], placement: { parent: 'user', order: 'a-long-order-key' } },
    ],
    expectedReads: { unseen: null, existing: 'prior' },
  };
  expect(parseCommit(proposed)).toEqual(proposed);
});

test.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'import rejects an invalid transaction sequence %s',
  async (sequence) => {
    const { parseRecord } = await import('./validation.ts');
    const input = record();
    expect(() =>
      parseRecord({ ...input, transaction: { ...input.transaction, sequence } }),
    ).toThrow();
  },
);

test.each([
  '',
  'a'.repeat(63),
  'a'.repeat(65),
  `g${'a'.repeat(64)}`,
  `${'a'.repeat(64)}g`,
  'A'.repeat(64),
])('import rejects a malformed request digest %s', async (requestDigest) => {
  const { parseRecord } = await import('./validation.ts');
  expect(() => parseRecord({ ...record(), requestDigest })).toThrow();
});

test('import rejects unsupported formats, empty version groups and malformed structural addresses', async () => {
  const { parseRecord } = await import('./validation.ts');
  const input = record();
  for (const invalid of [
    { ...input, format: 2 },
    { ...input, versions: [] },
    { ...input, transaction: { ...input.transaction, recordedAt: 'not-a-timestamp' } },
    { ...input, versions: [{ ...input.versions[0], key: { node: 'user' } }] },
    { ...input, versions: [{ ...input.versions[0], placement: { parent: 'user', order: '' } }] },
    {
      ...input,
      versions: [{ ...input.versions[0], connection: { source: { node: 'user' }, target: {} } }],
    },
    { ...input, unrecognized: true },
  ]) {
    expect(() => parseRecord(invalid)).toThrow();
  }
});

test.each(['', ' user', 'user ', 'user\n'])(
  'write requests reject invalid identities %j',
  async (id) => {
    const { parseCommit } = await import('./validation.ts');
    expect(() => parseCommit(request(id, [create('user', {})]))).toThrow();
  },
);

test('ingress rejects non-JSON object prototypes before accepting a write or imported record', async () => {
  const { parseCommit, parseRecord } = await import('./validation.ts');
  const proposed = request('new', [create('user', {})]);
  const imported = record();
  expect(() => parseCommit(Object.assign(Object.create({}), proposed))).toThrow();
  expect(() => parseRecord(Object.assign(Object.create({}), imported))).toThrow();
});
