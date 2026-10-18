import { expect, test } from 'vitest';
import { createPersistentStorage, e, openDatabase, type Journal } from '@/core/store/index.ts';
import {
  createDecision,
  decisionEntities,
  decisionSchema,
  readDecisions,
  removeDecision,
  reviseDecision,
} from './index.ts';

test('decision admission preserves exact text and validates real civil dates without guessing', async () => {
  await using db = await openDatabase({ schema: decisionSchema });
  const text = '  Keep this wording.\nIncluding this line.  ';
  await createDecision(db, { text });
  expect(await readDecisions(db)).toMatchObject([{ text, available: true }]);
  expect((await readDecisions(db))[0]?.date).toBeUndefined();
  for (const date of [
    '0000',
    '10000',
    '2026-00',
    '2026-13',
    '2026-2',
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-10-18T00:00:00Z',
  ])
    expect(() => createDecision(db, { text: 'Choice', date })).toThrow();
  expect(() => createDecision(db, { text: '  \n ' })).toThrow();
  expect(await readDecisions(db)).toHaveLength(1);
});

test.each(['2026', '2026-06', '2024-02-29'])(
  'decision preserves exact supplied date %s and rejects impossible revisions',
  async (date) => {
    await using db = await openDatabase({ schema: decisionSchema });
    const decision = await createDecision(db, { text: 'Choice', date });
    expect(await readDecisions(db)).toMatchObject([{ date }]);
    expect(() => reviseDecision(db, decision, { date: '2026-02-29' })).toThrow();
    expect(await readDecisions(db)).toMatchObject([{ date }]);
  },
);

test('independent durable reopen retains revisions, provenance and attribution after removal', async () => {
  const Source = e.entity('test.decisionSource', { text: e.string() });
  const schema = e.registry({ ...decisionEntities, sources: Source });
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'decisions-durable-test',
      load: async () => structuredClone(journal),
      append: (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
        return Promise.resolve();
      },
    });
  {
    await using db = await openDatabase({ schema, storage: storage() });
    const source = await db.transaction((tx) =>
      tx.entities.sources.insert({ text: 'Exact external note' }),
    );
    const snapshot = (await db.history.transactions.first({ select: {} }))!;
    const reference = await db.history.reference(snapshot, source);
    const decision = await createDecision(db, {
      text: 'Original choice',
      date: '2026',
      rationale: 'Original reason',
      attribution: 'Original source author',
      sources: [reference],
    });
    await reviseDecision(db, decision, { date: '2026-06' });
    await reviseDecision(db, decision, { date: '2026-10-12' });
    await reviseDecision(db, decision, {
      text: 'Corrected choice',
      date: null,
      rationale: 'Corrected reason',
    });
    expect(await readDecisions(db)).toMatchObject([
      {
        text: 'Corrected choice',
        rationale: 'Corrected reason',
        attribution: 'Original source author',
      },
    ]);
    expect((await readDecisions(db))[0]?.date).toBeUndefined();
    await removeDecision(db, decision);
    expect(await readDecisions(db)).toEqual([]);
    await expect(reviseDecision(db, decision, { text: 'Unintended revival' })).rejects.toThrow(
      'unavailable',
    );
    await db.transaction((tx) => tx.entities.sources.delete(source));
  }
  await using reopened = await openDatabase({ schema, storage: storage() });
  expect(await readDecisions(reopened)).toEqual([]);
  const removed = (await readDecisions(reopened, { includeUnavailable: true }))[0]!;
  expect(removed).toMatchObject({
    text: 'Corrected choice',
    rationale: 'Corrected reason',
    attribution: 'Original source author',
    available: false,
  });
  const resolved = await reopened.history.resolve(removed.sources[0]!);
  expect(await reopened.history.inspect(resolved.transaction, resolved.entity)).toMatchObject({
    values: { text: 'Exact external note' },
  });
  // Historical entity and transaction handles belong to the original backend. Reopen through journal lookup.
  const creation = (await reopened.history.transactions.query({ select: { sequence: true } })).find(
    (transaction) => transaction.sequence === 2,
  )!;
  expect(await readDecisions(reopened, { snapshot: creation })).toMatchObject([
    {
      text: 'Original choice',
      date: '2026',
      rationale: 'Original reason',
      attribution: 'Original source author',
      available: true,
    },
  ]);
  const transactions = await reopened.history.transactions.query({ select: { sequence: true } });
  await Promise.all(
    (
      [
        [3, '2026-06'],
        [4, '2026-10-12'],
      ] as const
    ).map(async ([sequence, date]) => {
      const snapshot = transactions.find((transaction) => transaction.sequence === sequence)!;
      expect(await readDecisions(reopened, { snapshot })).toMatchObject([{ date }]);
    }),
  );
});

test('invalid source provenance aborts the whole decision publication', async () => {
  const Source = e.entity('test.invalidDecisionSource', { text: e.string() });
  const schema = e.registry({ ...decisionEntities, sources: Source });
  await using db = await openDatabase({ schema });
  await using foreign = await openDatabase({ schema });
  const source = await foreign.transaction((tx) => tx.entities.sources.insert({ text: 'Foreign' }));
  const snapshot = (await foreign.history.transactions.first({ select: {} }))!;
  const address = await foreign.history.reference(snapshot, source);
  await expect(createDecision(db, { text: 'Unsupported', sources: [address] })).rejects.toThrow();
  expect(await readDecisions(db)).toEqual([]);
  expect(await db.entities.decisionSources.query({ select: {} })).toEqual([]);
});
