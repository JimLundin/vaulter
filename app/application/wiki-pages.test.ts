import { expect, test } from 'vitest';
import { createPersistentStorage, type Journal } from '@/application/store/index.ts';
import { wikiActions } from '@/wiki/operations.ts';
import { readEavWiki } from '@/wiki/pages.ts';
import { applicationDatabase, applicationHistory } from './composition.ts';

test('application Wiki reopens exact source evidence and historical attribution after edits and deletion', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  const openStorage = () =>
    createPersistentStorage({
      scope: 'application-evidence',
      load: async () => structuredClone(journal),
      append: async (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
      },
    });
  const storage = openStorage();
  const db = await applicationDatabase(storage);
  const { author, document } = await db.transaction(async (tx) => ({
    author: await tx.entities.actors.insert({ name: 'Original author', kind: 'user' }),
    document: await tx.entities.sourceDocuments.insert({
      key: 'source',
      title: 'Source note',
      text: 'Keep mornings free.',
      origin: 'fictional note',
      attribution: 'Original author',
      capturedAt: new Date(),
      available: true,
    }),
  }));
  const wiki = wikiActions(db, author);
  const page = await wiki.createPage({ key: 'studio', title: 'Studio', summary: '' });
  const paragraph = await wiki.append('claim', { kind: 'paragraph' }, { page, order: 'a' });
  await wiki.append(
    'words',
    { kind: 'text', text: 'Keep mornings free.' },
    { parent: paragraph, order: 'a' },
  );
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const source = await db.history.reference(snapshot, document);
  await wiki.referencePage('provenance', page, source);
  await wiki.review({
    key: 'review',
    assertion: {
      target: await db.history.reference(snapshot, paragraph),
      format: 'wiki-text-utf16-v1',
      start: 0,
      end: 19,
    },
    passages: [{ target: source, format: 'source-text-utf16-v1', start: 0, end: 19 }],
    result: 'supported',
    rationale: 'The captured note states this.',
  });
  await db.transaction(async (tx) => {
    await tx.entities.actors.update({ ...author, name: 'Renamed author' });
    await tx.entities.sourceDocuments.update({ ...document, text: 'Changed schedule.' });
  });
  await db.transaction(async (tx) => {
    const current = (await tx.entities.sourceDocuments.first({
      where: { key: { eq: 'source' } },
      select: {},
    }))!;
    await tx.entities.sourceDocuments.delete(current);
  });
  const reopenedStorage = openStorage();
  const reopened = await applicationDatabase(reopenedStorage);
  const pages = await readEavWiki(reopened);
  expect(pages).toHaveLength(1);
  expect(pages[0]?.sources[0]?.context).toBe('Keep mornings free.');
  expect((await reopened.history.resolve(source)).entity).toBeDefined();
  const history = await applicationHistory(reopenedStorage).entries();
  const review = history.find((entry) =>
    entry.details.some((detail) => detail.includes('Created evidence review')),
  );
  expect(review?.author).toBe('Original author');
  expect(history.every((entry) => entry.undo === undefined)).toBe(true);
});
