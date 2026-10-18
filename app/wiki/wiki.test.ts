import { expect, test } from 'vitest';
import {
  openDatabase,
  createPersistentStorage,
  SaveError,
  type Journal,
  sameEntity,
} from '@/application/store/index.ts';
import { wikiSchema } from './records.ts';
import { wikiActions } from './operations.ts';
import { readEavWiki } from './pages.ts';
import { contentText } from './content.ts';

async function fixture() {
  const db = await openDatabase({ schema: wikiSchema });
  const author = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Reviewer', kind: 'user' }),
  );
  const actions = wikiActions(db, author);
  const page = await actions.createPage({
    key: 'page',
    title: 'Garden',
    summary: 'A quiet garden.',
  });
  const paragraph = await actions.append('paragraph', { kind: 'paragraph' }, { page, order: 'a' });
  const words = await actions.append(
    'words',
    { kind: 'text', text: 'Keep mornings free. Afternoons are flexible.' },
    { parent: paragraph, order: 'a' },
  );
  const document = await db.transaction({ author }, (tx) =>
    tx.entities.sourceDocuments.insert({
      key: 'source',
      title: 'Original account',
      text: 'Keep mornings free. A quiet garden.',
      origin: 'https://example.invalid/account',
      attribution: 'Recorded speaker',
      capturedAt: new Date(),
      available: true,
    }),
  );
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  return {
    db,
    actions,
    page,
    paragraph,
    words,
    document,
    assertion: await db.history.reference(snapshot, paragraph),
    summary: await db.history.reference(snapshot, page),
    source: await db.history.reference(snapshot, document),
  };
}

test('partial review coverage, summary selectors and provenance remain independent after source deletion', async () => {
  const { db, actions, page, document, assertion, source, summary } = await fixture();
  await using owned = db;
  void owned;
  await actions.referencePage('provenance', page, source);
  let pages = await readEavWiki(db);
  expect(pages[0]?.summarySupport?.needsReference).toBe(true);
  expect(pages[0]?.blocks[0]?.support?.needsReference).toBe(true);
  await actions.review({
    key: 'first-clause',
    assertion: { target: assertion, format: 'wiki-text-utf16-v1', start: 0, end: 19 },
    passages: [{ target: source, format: 'source-text-utf16-v1', start: 0, end: 19 }],
    result: 'supported',
    rationale: 'The speaker explicitly said this clause.',
  });
  await actions.review({
    key: 'summary',
    assertion: { target: summary, format: 'wiki-summary-utf16-v1', start: 0, end: 15 },
    passages: [{ target: source, format: 'source-text-utf16-v1', start: 20, end: 35 }],
    result: 'supported',
    rationale: 'The second statement supports the selected summary.',
  });
  await actions.review({
    key: 'challenge',
    assertion: { target: assertion, format: 'wiki-text-utf16-v1', start: 0, end: 19 },
    passages: [{ target: source, format: 'source-text-utf16-v1', start: 0, end: 19 }],
    result: 'contradicted',
    rationale: 'Retain the reviewer disagreement independently.',
  });
  await db.transaction((tx) => tx.entities.sourceDocuments.delete(document));
  pages = await readEavWiki(db);
  expect(pages[0]?.blocks[0]?.support).toMatchObject({
    partlySupported: true,
    needsReference: true,
    disputed: true,
    supported: false,
  });
  expect(pages[0]?.blocks[0]?.evidence[0]).toMatchObject({
    text: 'Keep mornings free.',
    state: 'deleted',
  });
  expect(pages[0]?.summarySupport).toMatchObject({ supported: true, needsReference: false });
  expect(pages[0]?.summaryEvidence?.[0]?.text).toBe('A quiet garden.');
  expect(pages[0]?.sources[0]?.context).toBe('Keep mornings free. A quiet garden.');
});

test('edited selected text requires review while formatting and edits outside the selection retain support', async () => {
  const { db, actions, assertion, source, words } = await fixture();
  await using owned = db;
  void owned;
  await actions.review({
    key: 'review',
    assertion: { target: assertion, format: 'wiki-text-utf16-v1', start: 0, end: 19 },
    passages: [{ target: source, format: 'source-text-utf16-v1', start: 0, end: 19 }],
    result: 'supported',
    rationale: 'Direct support.',
  });
  await actions.updateContent(words, {
    kind: 'text',
    text: 'Keep mornings free. Later plans changed.',
    marks: ['strong'],
  });
  expect((await readEavWiki(db))[0]?.blocks[0]?.evidence).toHaveLength(1);
  await actions.updateContent(words, {
    kind: 'text',
    text: 'Use mornings for meetings. Later plans changed.',
  });
  const block = (await readEavWiki(db))[0]?.blocks[0];
  expect(block?.support).toMatchObject({ needsReference: true, needsReview: true });
  expect(block?.evidence).toHaveLength(0);
  expect(await db.entities.reviews.query({ select: {} })).toHaveLength(1);
});

test('shared content has independent appearances and local edit, removal, restoration and move history', async () => {
  const { db, actions, page, paragraph, words } = await fixture();
  await using owned = db;
  void owned;
  const second = await actions.createPage({ key: 'second', title: 'Second', summary: '' });
  await actions.share('shared', paragraph, { page: second, order: 'a' });
  const before = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await actions.updateContent(words, { kind: 'text', text: 'Shared change.' });
  let latest = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  expect(await db.history.changes(latest)).toHaveLength(1);
  expect((await readEavWiki(db)).map((page) => page.blocks[0]?.children[0]?.data.text)).toEqual([
    'Shared change.',
    'Shared change.',
  ]);
  expect(await contentText(db.at(before), paragraph)).toBe(
    'Keep mornings free. Afternoons are flexible.',
  );
  await actions.removeContent(paragraph);
  expect((await readEavWiki(db)).map((page) => page.blocks[0]?.data.kind)).toEqual([
    'unavailable',
    'unavailable',
  ]);
  await actions.removeContent(paragraph, true);
  await actions.move('shared', { page, order: 'b' });
  latest = (await db.history.transactions.first({ select: {}, orderBy: [{ sequence: 'desc' }] }))!;
  expect(await db.history.changes(latest)).toHaveLength(1);
  expect((await readEavWiki(db)).find((entry) => entry.id === 'page')?.blocks).toHaveLength(2);
  await expect(
    actions.share('recursive', paragraph, { parent: paragraph, order: 'a' }),
  ).rejects.toThrow('recursive');
  expect(
    await db.entities.wikiAppearances.first({ where: { key: { eq: 'recursive' } }, select: {} }),
  ).toBeUndefined();
});

test('invalid evidence, duplicate identities and surrogate-splitting selections reject whole operations', async () => {
  const { db, actions, assertion, summary, source, page } = await fixture();
  await using owned = db;
  void owned;
  await expect(
    actions.createPage({ key: 'page', title: 'Duplicate', summary: '' }),
  ).rejects.toThrow('already in use');
  await expect(
    actions.review({
      key: 'invalid',
      assertion: { target: assertion, format: 'wiki-text-utf16-v1', start: 0, end: 19 },
      passages: [{ target: summary, format: 'source-text-utf16-v1', start: 0, end: 5 }],
      result: 'supported',
      rationale: 'Invalid self support.',
    }),
  ).rejects.toThrow('cannot support');
  await expect(
    actions.review({
      key: 'outside',
      assertion: { target: assertion, format: 'wiki-text-utf16-v1', start: 0, end: 999 },
      passages: [{ target: source, format: 'source-text-utf16-v1', start: 0, end: 5 }],
      result: 'supported',
      rationale: 'Invalid range.',
    }),
  ).rejects.toThrow('outside');
  const emoji = await actions.append(
    'emoji',
    { kind: 'text', text: '🌱 garden' },
    { page, order: 'b' },
  );
  const latest = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const target = await db.history.reference(latest, emoji);
  await expect(
    actions.review({
      key: 'split',
      assertion: { target, format: 'wiki-text-utf16-v1', start: 0, end: 1 },
      passages: [],
      result: 'missing',
      rationale: 'Invalid UTF-16.',
    }),
  ).rejects.toThrow('surrogate');
  expect(await db.entities.reviews.query({ select: {} })).toHaveLength(0);
});

test('lost acceptance response retries the exact Wiki operation and a fresh backend reopens it once', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  let drop = false;
  const storage = () =>
    createPersistentStorage({
      scope: 'wiki-fixture',
      load: () => Promise.resolve(structuredClone(journal)),
      append: (request) => {
        if (!journal.commits.some((commit) => commit.id === request.commit.id))
          journal = structuredClone({
            schemas: request.schemas,
            commits: [...journal.commits, request.commit],
          });
        if (drop) {
          drop = false;
          return Promise.reject(new Error('Acknowledgement lost'));
        }
        return Promise.resolve();
      },
    });
  await using db = await openDatabase({ schema: wikiSchema, storage: storage() });
  const author = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Owner', kind: 'user' }),
  );
  drop = true;
  let error: unknown;
  try {
    await wikiActions(db, author).createPage({ key: 'once', title: 'Once', summary: '' });
  } catch (failure) {
    error = failure;
  }
  if (!(error instanceof SaveError)) throw new Error('Expected uncertain save');
  await error.retry();
  await error.retry();
  await using reopened = await openDatabase({ schema: wikiSchema, storage: storage() });
  expect((await readEavWiki(reopened)).map((page) => page.title)).toEqual(['Once']);
  expect(journal.commits).toHaveLength(2);
  const actor = (await reopened.entities.actors.first({ select: {} }))!;
  expect(sameEntity(actor, author)).toBe(false);
});

test('selected inline evidence contributes only its span to paragraph coverage and shared occurrences have distinct view identities', async () => {
  const { db, actions, page, paragraph, words, source } = await fixture();
  await using owned = db;
  void owned;
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await actions.review({
    key: 'inline',
    assertion: {
      target: await db.history.reference(snapshot, words),
      format: 'wiki-text-utf16-v1',
      start: 0,
      end: 19,
    },
    passages: [{ target: source, format: 'source-text-utf16-v1', start: 0, end: 19 }],
    result: 'supported',
    rationale: 'Only the selected clause is supported.',
  });
  await actions.share('second-occurrence', paragraph, { page, order: 'b' });
  const blocks = (await readEavWiki(db))[0]!.blocks;
  expect(blocks[0]!.support).toMatchObject({
    partlySupported: true,
    supported: false,
    needsReference: true,
  });
  expect(blocks[0]!.evidence[0]!.claim).toEqual({ start: 0, end: 19 });
  expect(blocks[0]!.children[0]!.id).not.toBe(blocks[1]!.children[0]!.id);
  await actions.updateContent(words, { kind: 'text', text: 'Plans changed.' });
  expect((await readEavWiki(db))[0]!.blocks[0]!.support).toMatchObject({
    needsReference: true,
    needsReview: true,
  });
});

test('navigation-only reviews do not certify prose support', async () => {
  const { db, actions, assertion, source } = await fixture();
  await using owned = db;
  void owned;
  await actions.review({
    key: 'navigation',
    assertion: { target: assertion, format: 'wiki-text-utf16-v1', start: 0, end: 19 },
    passages: [{ target: source, format: 'source-text-utf16-v1', start: 0, end: 19 }],
    result: 'navigation',
    rationale: 'Related material for exploration only.',
  });
  const block = (await readEavWiki(db))[0]!.blocks[0]!;
  expect(block.support).toMatchObject({
    supported: false,
    partlySupported: false,
    needsReference: true,
  });
  expect(block.evidence).toHaveLength(1);
});

test('historical evidence and text projection remain complete beyond the default query page', async () => {
  const { db, paragraph } = await fixture();
  await using owned = db;
  void owned;
  await db.transaction(async (tx) => {
    for (let index = 0; index < 110; index++) {
      await tx.entities.wikiPages.insert({
        key: `bulk-page-${index}`,
        title: `Page ${index}`,
        summary: `Summary ${index}`,
        aliases: [],
        available: true,
        createdAt: new Date(),
      });
      const content = await tx.entities.wikiContent.insert({
        key: `bulk-text-${index}`,
        kind: 'text',
        text: 'x',
        available: true,
      });
      await tx.entities.wikiAppearances.insert({
        key: `bulk-appearance-${index}`,
        content,
        parent: paragraph,
        order: `z${String(index).padStart(3, '0')}`,
        available: true,
      });
      await tx.entities.sourceDocuments.insert({
        key: `bulk-source-${index}`,
        title: `Source ${index}`,
        attribution: 'Recorded speaker',
        text: `Evidence ${index}`,
        origin: '',
        capturedAt: new Date(),
        available: true,
      });
    }
  });
  const pageWindow = await db.entities.wikiPages.query({ select: {} });
  const page = (await db.entities.wikiPages.query({ select: { summary: true }, limit: null })).find(
    (item) => !pageWindow.some((row) => sameEntity(row, item)),
  )!;
  const sourceWindow = await db.entities.sourceDocuments.query({ select: {} });
  const source = (
    await db.entities.sourceDocuments.query({ select: { text: true }, limit: null })
  ).find((item) => !sourceWindow.some((row) => sameEntity(row, item)))!;
  const contentWindow = await db.entities.wikiContent.query({ select: {} });
  const content = (
    await db.entities.wikiContent.query({ select: { text: true }, limit: null })
  ).find((item) => !contentWindow.some((row) => sameEntity(row, item)))!;
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const { documentSources, selectorReader } = await import('@/wiki/reviews/selection.ts');
  const readSelection = selectorReader(db, documentSources(db));
  const sourceAddress = await db.history.reference(snapshot, source);
  expect((await documentSources(db)(sourceAddress)).recorded.text).toBe(source.text);
  expect(
    (
      await readSelection({
        target: await db.history.reference(snapshot, page),
        format: 'wiki-summary-utf16-v1',
        start: 0,
        end: page.summary.length,
      })
    ).text,
  ).toBe(page.summary);
  expect(
    (
      await readSelection({
        target: await db.history.reference(snapshot, content),
        format: 'wiki-text-utf16-v1',
        start: 0,
        end: content.text!.length,
      })
    ).text,
  ).toBe(content.text);
  const text = await contentText(db.at(snapshot), paragraph);
  expect(text).toBe(`Keep mornings free. Afternoons are flexible.${'x'.repeat(110)}`);
  expect(await readEavWiki(db)).toHaveLength(111);
});

test('containment admission detects a cycle whose path exceeds the default query page', async () => {
  const { db, actions, page } = await fixture();
  await using owned = db;
  const sections = await owned.transaction(async (tx) => {
    const chain = [];
    for (let index = 0; index < 105; index++) {
      const section = await tx.entities.wikiContent.insert({
        key: `section-${index}`,
        kind: 'section',
        available: true,
      });
      await tx.entities.wikiAppearances.insert({
        key: `section-${index}:appearance`,
        content: section,
        ...(index ? { parent: chain[index - 1] } : { page }),
        order: 'a',
        available: true,
      });
      chain.push(section);
    }
    return chain;
  });
  await expect(
    actions.share('cycle', sections[0], { parent: sections.at(-1)!, order: 'b' }),
  ).rejects.toThrow('recursive');
  expect(
    await owned.entities.wikiAppearances.first({ where: { key: { eq: 'cycle' } }, select: {} }),
  ).toBeUndefined();
});
