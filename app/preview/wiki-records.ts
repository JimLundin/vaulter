import { sameEntity } from '@/vault/eav/index.ts';
import { wikiActions } from '@/workflows/wiki/data/operations.ts';
import type { WikiDatabase } from '@/workflows/wiki/data/evidence.ts';

/** Fictional records exercise the native typed Wiki, source and review contracts. */
export async function seedEavWiki(db: WikiDatabase) {
  if (await db.entities.wikiPages.first({ where: { key: { eq: 'preview:page:0' } }, select: {} }))
    return;
  const author = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Fictional owner', kind: 'user' }),
  );
  const actions = wikiActions(db, author);
  const pages = [];
  for (const [index, title] of ['Garden studio', 'Slow mornings', 'Reading list'].entries()) {
    pages.push(
      await actions.createPage({
        key: `preview:page:${index}`,
        title,
        summary: 'Room for the things that matter.',
      }),
    );
  }
  const paragraph = await actions.append(
    'preview:paragraph:0',
    { kind: 'paragraph' },
    { page: pages[0]!, order: 'a' },
  );
  await actions.append(
    'preview:words:0',
    { kind: 'text', text: 'Keep ', marks: ['emphasis'] },
    { parent: paragraph, order: 'a' },
  );
  await actions.append(
    'preview:words:1',
    { kind: 'text', text: 'mornings free.', marks: ['strong'] },
    { parent: paragraph, order: 'b' },
  );
  const flexible = await actions.append(
    'preview:flexible',
    { kind: 'paragraph' },
    { page: pages[0]!, order: 'b' },
  );
  await actions.append(
    'preview:flexible:words',
    { kind: 'text', text: 'Afternoons are flexible.' },
    { parent: flexible, order: 'a' },
  );
  for (const [index, page] of pages.entries()) {
    if (!index) continue;
    const paragraph = await actions.append(
      `preview:paragraph:${index}`,
      { kind: 'paragraph' },
      { page, order: 'a' },
    );
    await actions.append(
      `preview:page-words:${index}`,
      { kind: 'text', text: 'Leave the mornings free for making things.' },
      { parent: paragraph, order: 'a' },
    );
  }
  const documents: import('@/vault/eav/index.ts').EntityRef<
    typeof import('@/vault/sources/schema.ts').SourceDocument
  >[] = [];
  for (let index = 0; index < 12; index++) {
    documents.push(
      await db.transaction({ author }, (tx) =>
        tx.entities.sourceDocuments.insert({
          key: `preview:source:${index}`,
          title: index === 0 ? 'Studio plans' : `Planning note ${index + 1}`,
          text: 'Earlier plans. '.repeat(40) + 'Keep mornings free.' + ' Later details.'.repeat(40),
          origin: `https://example.invalid/studio/${index}`,
          attribution: 'Fictional owner',
          capturedAt: new Date(),
          occurredAt: '2026-10-12',
          available: true,
        }),
      ),
    );
  }
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const assertion = await db.history.reference(snapshot, paragraph);
  for (const [index, document] of documents.entries()) {
    const source = await db.history.reference(snapshot, document);
    await actions.referencePage(`preview:page-reference:${index}`, pages[0]!, source);
    if (!index) {
      const start = 'Earlier plans. '.repeat(40).length;
      await actions.review({
        key: 'preview:review:0',
        assertion: { target: assertion, format: 'wiki-text-utf16-v1', start: 0, end: 19 },
        passages: [{ target: source, format: 'source-text-utf16-v1', start, end: start + 19 }],
        result: 'supported',
        rationale: 'The captured owner statement explicitly supports the selected prose.',
      });
    }
  }
  await db.transaction({ author }, async (tx) => {
    const current = (await tx.entities.sourceDocuments.query({ select: { text: true } })).find(
      (item) => sameEntity(item, documents[0]),
    )!;
    await tx.entities.sourceDocuments.update({ ...current, text: 'A newer plan.' });
  });
}
