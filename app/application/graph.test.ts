import { expect, test } from 'vitest';
import { createMemoryStorage } from '@/vault/eav/index.ts';
import { applicationDatabase, applicationGraph } from './composition.ts';

test('Application Graph reads owner entities and retains accepted endpoint evidence after deletion', async () => {
  const storage = createMemoryStorage();
  const db = await applicationDatabase(storage);
  const { page, term } = await db.transaction(async (tx) => ({
    page: await tx.entities.wikiPages.insert({
      key: 'studio',
      title: 'Studio',
      summary: '',
      aliases: [],
      available: true,
      createdAt: new Date(),
    }),
    term: await tx.entities.graphTerms.insert({ key: 'place', scheme: 'type', available: true }),
  }));
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const source = await db.history.reference(snapshot, page);
  const target = await db.history.reference(snapshot, term);
  await db.transaction((tx) =>
    tx.entities.graphRelationships.insert({
      key: 'type',
      predicate: 'type',
      source,
      target,
      available: true,
    }),
  );
  const original = await applicationGraph(storage);
  expect(original.vocabulary('type')[0]?.data.key).toBe('place');
  expect(
    original.query({ type: 'place' }, [{ entity: source.entity, title: 'Studio' }]),
  ).toHaveLength(1);
  await db.transaction((tx) => tx.entities.graphTerms.delete(term));
  const current = await applicationGraph(storage);
  expect(current.vocabulary()).toEqual([]);
  expect(current.classifications(source)).toMatchObject([{ key: 'place', state: 'resolved' }]);
  expect(original.vocabulary()).toHaveLength(1);
});
