import { expect, test } from 'vitest';
import { openDatabase, createMemoryStorage } from '@/vault/eav/index.ts';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { seed, create, request } from '@/vault/nodes/fixtures.test-support.ts';
import { transactionFixture } from '@/vault/transactions/fixtures.test-support.ts';
import { migrateDialogue } from './migration.ts';
import { chatSchema } from './schema.ts';
import { dialogue } from './timeline.ts';

test('historical contributions interleave old containers by instant and retain evidence and precision', async () => {
  const raw = memoryNodeBackend();
  await seed(raw);
  await raw.commit(
    request('history', [
      create('chat-a', { kind: 'conversation', title: 'A', createdAt: '2026-01-01T00:00:00Z' }),
      create('chat-b', { kind: 'conversation', title: 'B', createdAt: '2026-01-02T00:00:00Z' }),
      create('exchange-a', { kind: 'exchange', startedAt: '2026-01-01T00:00:00Z' }, 'chat-a'),
      create('exchange-b', { kind: 'exchange', startedAt: '2026-01-02T00:00:00Z' }, 'chat-b'),
      create(
        'early',
        { kind: 'message', role: 'user', text: 'First', at: '2026-01-03T10:00:00+02:00' },
        'exchange-a',
      ),
      create(
        'late',
        {
          kind: 'message',
          role: 'agent',
          status: 'stopped',
          parts: [{ kind: 'text', text: 'Last' }],
          at: '2026-01-03T10:00:00Z',
        },
        'exchange-a',
      ),
      create(
        'middle',
        { kind: 'message', role: 'user', text: 'Between', at: '2026-01-03T09:00:00Z' },
        'exchange-b',
      ),
      create(
        'summary',
        {
          kind: 'message',
          role: 'record',
          text: 'Day-only account',
          record: { kind: 'summary' },
          at: '2026-01-04T00:00:00Z',
          atPrecision: 'day',
        },
        'exchange-b',
      ),
    ]),
  );
  const nodes = transactionFixture(raw);
  const storage = createMemoryStorage();
  await using db = await openDatabase({ schema: chatSchema, storage });
  await migrateDialogue(db, nodes);
  const entries = await dialogue(db);
  expect(entries.map((entry) => entry.messages[0])).toMatchObject([
    { role: 'user', text: 'First' },
    { role: 'user', text: 'Between' },
    { role: 'agent', status: 'stopped', parts: [{ text: 'Last' }] },
    { role: 'record', text: 'Day-only account', atPrecision: 'day' },
  ]);
  expect(entries.at(-1)?.at).toBe('2026-01-04');
  expect(await db.entities.conversations.query({ select: {} })).toHaveLength(1);
  expect(await db.entities.agentRuns.query({ select: {} })).toHaveLength(0);
  const evidence = await db.entities.retainedSources.query({ select: { provenance: true } });
  expect(evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        provenance: expect.objectContaining({
          message: { node: 'middle', transaction: 'history' },
          conversation: { node: 'chat-b', transaction: 'history' },
          original: expect.objectContaining({ text: 'Between' }),
        }),
      }),
    ]),
  );
  const commits = storage.inspect().transactions.length;
  await migrateDialogue(db, nodes);
  expect(storage.inspect().transactions).toHaveLength(commits);
  expect(await dialogue(db)).toEqual(entries);
});
