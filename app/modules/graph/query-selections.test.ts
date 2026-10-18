import { expect, test } from 'vitest';
import { createPersistentStorage, e, openDatabase, type Journal } from '@/core/store/index.ts';
import {
  graphEntities,
  querySelectionAdmission,
  readQuerySelections,
  savedQueryActions,
} from './index.ts';
import { WikiPageRecord } from '@/modules/wiki/index.ts';
import { SourceDocument } from '@/modules/sources/index.ts';

const schema = e.registry({
  ...graphEntities,
  wikiPages: WikiPageRecord,
  sourceDocuments: SourceDocument,
});

test('captured migration evaluation retains exact ordered Page states and correspondence after independent reopen', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'query-selections-durable',
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
  const { a, b, source } = await db.transaction(async (tx) => ({
    a: await tx.entities.wikiPages.insert({
      key: 'a',
      title: 'Zulu',
      summary: '',
      aliases: [],
      available: true,
      createdAt: new Date(),
    }),
    b: await tx.entities.wikiPages.insert({
      key: 'b',
      title: 'Alpha',
      summary: '',
      aliases: [],
      available: true,
      createdAt: new Date(),
    }),
    source: await tx.entities.sourceDocuments.insert({
      key: 'cutoff',
      title: 'Original cutoff',
      text: 'Exact preserved selection',
      origin: 'external:cutoff',
      attribution: 'Recorded author',
      capturedAt: new Date(),
      available: true,
    }),
  }));
  const query = await savedQueryActions(db).create({
    key: 'query',
    type: 'person',
    tag: 'colleague',
  });
  const cutoff = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const queryAddress = await db.history.reference(cutoff, query);
  const pageA = await db.history.reference(cutoff, a);
  const pageB = await db.history.reference(cutoff, b);
  const provenance = await db.history.retainedStateReference(cutoff, source);
  const input = {
    key: 'capture',
    query: queryAddress,
    provenance,
    origin: 'migration-evaluation' as const,
    members: [
      {
        page: pageA,
        correspondence: provenance,
        position: 1,
        classification: {
          type: 'person',
          tags: ['colleague'],
          cutoff: provenance,
          sources: [provenance],
          hashes: ['a'.repeat(64)],
        },
      },
      { page: pageB, correspondence: provenance, position: 0 },
    ],
  };
  const selection = await db.transaction((tx) => querySelectionAdmission(tx).capture(input));
  const selectedSnapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const selectedAddress = await db.history.reference(selectedSnapshot, selection);
  await expect(
    db.transaction((tx) =>
      querySelectionAdmission(tx).capture({
        ...input,
        key: 'bad-order',
        members: input.members.map((member) => ({ ...member, position: 0 })),
      }),
    ),
  ).rejects.toThrow('positions');
  await expect(
    db.transaction((tx) =>
      querySelectionAdmission(tx).capture({
        ...input,
        key: 'bad-page',
        members: [{ ...input.members[0]!, page: queryAddress }],
      }),
    ),
  ).rejects.toThrow('Page');
  await db.transaction(async (tx) => {
    await tx.entities.wikiPages.update({ ...a, title: 'Changed' });
    await tx.entities.wikiPages.delete(b);
  });
  expect((await readQuerySelections(db))[0]?.members.map((member) => member.values?.title)).toEqual(
    ['Alpha', 'Zulu'],
  );
  await db.transaction((tx) => querySelectionAdmission(tx).remove(selection));
  await db[Symbol.asyncDispose]();
  await using reopened = await openDatabase({ schema, storage: storage() });
  expect(await readQuerySelections(reopened)).toEqual([]);
  const retained = (await readQuerySelections(reopened, { includeUnavailable: true }))[0]!;
  expect(retained.members.find((member) => member.position === 1)).toMatchObject({
    classificationType: 'person',
    classificationTags: ['colleague'],
    classificationCutoff: provenance,
    classificationSources: [provenance],
    classificationHashes: ['a'.repeat(64)],
  });
  expect(retained).toMatchObject({
    available: false,
    origin: 'migration-evaluation',
    query: queryAddress,
    provenance,
  });
  expect(
    retained.members.map((member) => ({
      title: member.values?.title,
      page: member.page,
      position: member.position,
      correspondence: member.correspondence,
    })),
  ).toEqual([
    { title: 'Alpha', page: pageB, position: 0, correspondence: provenance },
    { title: 'Zulu', page: pageA, position: 1, correspondence: provenance },
  ]);
  const selected = await reopened.history.resolve(selectedAddress);
  expect(
    (await readQuerySelections(reopened, { snapshot: selected.transaction }))[0]?.available,
  ).toBe(true);
});
