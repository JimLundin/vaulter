import { expect, test } from 'vitest';
import { createPersistentStorage, e, openDatabase, type Journal } from '@/core/store/index.ts';
import {
  graphEntities,
  savedQueryAdmission,
  savedQueryActions,
  readQueries,
  readQueryEmbed,
} from './index.ts';
import { SourceDocument } from '@/modules/sources/index.ts';

const Subject = e.entity('test.querySubject', {
  title: e.string(),
  available: e.boolean(),
  type: e.string().optional(),
  tags: e.set(e.string()).optional(),
});
const schema = e.registry({ ...graphEntities, subjects: Subject, sourceDocuments: SourceDocument });

test('saved query replacement preserves omission, source state and unavailable final fields through durable reopen', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'query-durable',
      load: async () => structuredClone(journal),
      append: (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
        return Promise.resolve();
      },
    });
  const db = await openDatabase({ schema, storage: storage() });
  const document = await db.transaction((tx) =>
    tx.entities.sourceDocuments.insert({
      key: 'external-query',
      title: 'Original note',
      text: 'Query source',
      origin: 'external:query',
      attribution: 'Recorded author',
      capturedAt: new Date(),
      available: true,
    }),
  );
  await db.transaction((tx) => tx.entities.sourceDocuments.delete(document));
  const sourceSnapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const provenance = await db.history.retainedStateReference(sourceSnapshot, document);
  const query = await db.transaction((tx) =>
    savedQueryAdmission(tx).create({
      key: 'saved',
      type: 'project',
      tag: 'active',
      sort: 'title',
      provenance,
    }),
  );
  const original = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const address = await db.history.reference(original, query);
  const actions = savedQueryActions(db);
  await actions.replace(query, { key: 'saved', sort: 'created', provenance });
  const changed = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  expect(await readQueries(db)).toMatchObject([{ sort: 'created', provenance }]);
  expect((await readQueries(db))[0]?.type).toBeUndefined();
  expect((await readQueries(db))[0]?.tag).toBeUndefined();
  const changedAddress = await db.history.reference(changed, query);
  await actions.replace(query, { key: 'saved', provenance });
  expect((await readQueries(db))[0]?.sort).toBeUndefined();
  await actions.remove(query);
  await db[Symbol.asyncDispose]();
  await using reopened = await openDatabase({ schema, storage: storage() });
  expect(await readQueries(reopened)).toEqual([]);
  const final = (await readQueries(reopened, { includeUnavailable: true }))[0]!;
  expect(final).toMatchObject({ available: false, provenance });
  expect(final.sort).toBeUndefined();
  const originalResolved = await reopened.history.resolve(address);
  const changedResolved = await reopened.history.resolve(changedAddress);
  expect(
    (await readQueries(reopened, { snapshot: originalResolved.transaction }))[0],
  ).toMatchObject({
    type: 'project',
    tag: 'active',
    sort: 'title',
    provenance,
  });
  expect((await readQueries(reopened, { snapshot: changedResolved.transaction }))[0]).toMatchObject(
    {
      sort: 'created',
    },
  );
  expect((await reopened.history.reference(originalResolved.transaction, final)).entity).toBe(
    address.entity,
  );
  expect((await reopened.history.resolveRetainedState(provenance)).state).toBe('deleted');
});

test('query embed derives ordered results at the selected snapshot rather than current data or invented receipts', async () => {
  await using db = await openDatabase({ schema });
  const { a, b, evidence } = await db.transaction(async (tx) => ({
    evidence: await tx.entities.sourceDocuments.insert({
      key: 'taxonomy',
      title: 'Taxonomy source',
      text: 'Recorded type and tags',
      origin: 'external:taxonomy',
      attribution: 'Author',
      capturedAt: new Date(),
      available: true,
    }),
    a: await tx.entities.subjects.insert({
      title: 'Zulu',
      available: true,
      type: 'person',
      tags: ['colleague'],
    }),
    b: await tx.entities.subjects.insert({
      title: 'Alpha',
      available: true,
      type: 'person',
      tags: ['colleague'],
    }),
  }));
  const query = await savedQueryActions(db).create({
    key: 'all',
    type: 'person',
    tag: 'colleague',
  });
  const before = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const taxonomySource = await db.history.retainedStateReference(before, evidence);
  const candidates = async (snapshot = before) =>
    Promise.all(
      (
        await db.at(snapshot).entities.subjects.query({
          limit: null,
          select: { title: true, available: true, type: true, tags: true },
        })
      ).map(async (subject) => {
        const address = await db.history.reference(snapshot, subject);
        return {
          entity: address.entity,
          address,
          title: subject.title,
          available: subject.available,
          classification: {
            type: subject.type,
            tags: subject.tags ?? [],
            cutoff: taxonomySource,
            sources: [taxonomySource],
          },
        };
      }),
    );
  const oldCandidates = await candidates();
  const pinned = await readQueryEmbed(db, query, oldCandidates, { snapshot: before });
  expect(pinned?.resultKind).toBe('historical-derived');
  expect(pinned?.results.map((item) => item.title)).toEqual(['Alpha', 'Zulu']);
  await db.transaction(async (tx) => {
    await tx.entities.subjects.update({ ...a, title: 'Aardvark' });
    await tx.entities.subjects.update({ ...b, tags: ['circle/work'] });
  });
  const current = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  expect(
    (await readQueryEmbed(db, query, await candidates(current)))?.results.map((item) => item.title),
  ).toEqual(['Aardvark']);
  expect(
    (await readQueryEmbed(db, query, oldCandidates, { snapshot: before }))?.results.map(
      (item) => item.title,
    ),
  ).toEqual(['Alpha', 'Zulu']);
  await expect(readQueryEmbed(db, query, oldCandidates, { snapshot: current })).rejects.toThrow(
    'snapshot',
  );
  await savedQueryActions(db).replace(query, { key: 'all', type: 'unknown' });
  expect((await readQueryEmbed(db, query, oldCandidates, { snapshot: before }))?.criteria).toEqual({
    type: 'person',
    tag: 'colleague',
  });
  expect((await db.at(before).entities.subjects.get(a, { select: { title: true } }))?.title).toBe(
    'Zulu',
  );
});
