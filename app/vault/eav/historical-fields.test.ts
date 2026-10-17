import { expect, test } from 'vitest';
import { e, openDatabase, createPersistentStorage, parseJournal, type Journal } from './index.ts';

test('historical schema attributes enforce exact accepted targets and survive durable replay after deletion', async () => {
  const Note = e.entity('note', { text: e.string() });
  const Evidence = e.entity('evidence', { source: e.historicalRef() });
  const schema = e.registry({ notes: Note, evidence: Evidence });
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'historical-fields',
      load: () => Promise.resolve(journal),
      append: (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
        return Promise.resolve();
      },
    });
  await using db = await openDatabase({ schema, storage: storage() });
  const note = await db.transaction((tx) => tx.entities.notes.insert({ text: 'Exact source' }));
  const transaction = (await db.history.transactions.first({ select: {} }))!;
  const source = await db.history.reference(transaction, note);
  const evidence = await db.transaction((tx) => tx.entities.evidence.insert({ source }));
  expect(
    await db.entities.evidence.query({ where: { source: { eq: source } }, select: {} }),
  ).toHaveLength(1);
  await expect(
    db.transaction((tx) =>
      tx.entities.evidence.insert({ source: { ...source, entity: 'missing' } }),
    ),
  ).rejects.toThrow('unavailable');
  await expect(
    db.transaction((tx) =>
      tx.entities.evidence.insert({ source: { ...source, scope: 'foreign' } }),
    ),
  ).rejects.toThrow('another database');
  await db.transaction((tx) => tx.entities.notes.delete(note));
  await using reopened = await openDatabase({ schema, storage: storage() });
  const saved = (await reopened.entities.evidence.first({ select: { source: true } }))!;
  expect(saved.source).toEqual(source);
  const resolved = await reopened.history.resolve(saved.source);
  expect(await reopened.history.inspect(resolved.transaction, resolved.entity)).toMatchObject({
    values: { text: 'Exact source' },
  });
  const corrupted = structuredClone(journal);
  const fact = corrupted.commits[1]!.facts.find((fact) => fact.attribute === 'evidence/source')!;
  if (!(typeof fact.value === 'object' && 'history' in fact.value))
    throw new Error('Expected historical value');
  Object.assign(fact.value, { history: JSON.stringify({ ...source, entity: 'missing' }) });
  expect(() => parseJournal(corrupted)).toThrow();
  expect(await db.entities.evidence.get(evidence, { select: {} })).toBeDefined();
});
