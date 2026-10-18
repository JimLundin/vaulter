// Fictional native relationships and, for the explicit comparison, retained evidence.
import type { Database, EntityRef } from '@/core/store/index.ts';
import type { applicationSchema } from '@/application/composition/composition.ts';
import { wikiActions } from '@/modules/wiki/operations.ts';
import { graphActions } from '@/modules/graph/index.ts';
import { topicActions } from '@/modules/graph/topics.ts';

type PreviewDatabase = Database<typeof applicationSchema>;
export async function seedGraphEvidence(db: PreviewDatabase, comparison = true) {
  const author = (await db.entities.actors.first({
    where: { name: { eq: 'Fictional owner' } },
    select: {},
  }))!;
  if (
    !(await db.entities.graphTerms.first({
      where: { key: { eq: 'preview:graph-predicate' } },
      select: {},
    }))
  ) {
    const pages = await db.entities.wikiPages.query({ select: { key: true } });
    const snapshot = (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }))!;
    const addresses = await Promise.all(
      [0, 1, 2].map((index) =>
        db.history.reference(snapshot, pages.find((item) => item.key === `preview:page:${index}`)!),
      ),
    );
    const place = await db.transaction({ author }, (tx) =>
      tx.entities.graphTerms.insert({
        key: 'preview:graph-place',
        scheme: 'type',
        label: 'Place',
        available: true,
      }),
    );
    const latest = (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }))!;
    const placeAddress = await db.history.reference(latest, place);
    await db.transaction({ author }, async (tx) => {
      await tx.entities.graphTerms.insert({
        key: 'preview:graph-predicate',
        scheme: 'predicate',
        label: 'Related to',
        symmetric: true,
        use: 'People, places and ideas that belong together.',
        available: true,
      });
      await tx.entities.graphRelationships.insert({
        key: 'preview:graph-mornings',
        predicate: 'related-to',
        source: addresses[0]!,
        target: addresses[1]!,
        available: true,
      });
      await tx.entities.graphRelationships.insert({
        key: 'preview:graph-reading',
        predicate: 'related-to',
        source: addresses[1]!,
        target: addresses[2]!,
        available: true,
      });
      await tx.entities.graphRelationships.insert({
        key: 'preview:graph-type',
        predicate: 'type',
        source: addresses[0]!,
        target: placeAddress,
        available: true,
      });
    });
  }
  if (
    !(await db.entities.graphRelationships.first({
      where: { key: { eq: 'preview:graph-candidate' } },
      select: {},
    }))
  ) {
    const pages = await db.entities.wikiPages.query({ select: { key: true } });
    const snapshot = (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }))!;
    const source = await db.history.reference(
      snapshot,
      pages.find((item) => item.key === 'preview:page:0')!,
    );
    const target = await db.history.reference(
      snapshot,
      pages.find((item) => item.key === 'preview:page:1')!,
    );
    await graphActions(db, { author }).candidate({
      key: 'preview:graph-candidate',
      predicate: 'related-to',
      label: 'Studio relationship',
      source,
      target,
      direction: 'unknown',
      clarificationReason: 'The note did not record a direction',
    });
  }
  if (
    !comparison ||
    (await db.entities.wikiPages.first({
      where: { key: { eq: 'preview:graph-topic' } },
      select: {},
    }))
  )
    return;
  const wiki = wikiActions(db, author);
  const page = await wiki.createPage({
    key: 'preview:graph-topic',
    title: 'Studio routine',
    summary:
      'A routine for focused work in a small studio. Two statements have citations; a proposed tool rack still needs evidence.',
  });
  const claims = [
    'Protect mornings for focused hand-tool work.',
    'Keep the workbench clear between sessions.',
    'A wall-mounted tool rack would make the studio easier to use.',
  ];
  const passages = [
    'I use chisels and a hand plane most mornings. It is the only part of the day when I can work without interruptions. The power tools are for occasional afternoon projects.',
    'There is not room to leave everything out. When tools stay on the bench overnight, I spend the next session moving them before I can start.',
  ];
  const paragraphs: EntityRef<typeof import('@/modules/wiki/records.ts').Content>[] = [];
  for (const [index, text] of claims.entries()) {
    const paragraph = await wiki.append(
      `preview:graph-claim:${index}`,
      { kind: 'paragraph' },
      { page, order: String(index) },
    );
    paragraphs.push(paragraph);
    await wiki.append(
      `preview:graph-words:${index}`,
      { kind: 'text', text },
      { parent: paragraph, order: 'a' },
    );
  }
  const documents: EntityRef<typeof import('@/modules/sources/records.ts').SourceDocument>[] = [];
  for (const [index, text] of passages.entries())
    documents.push(
      await db.transaction({ author }, (tx) =>
        tx.entities.sourceDocuments.insert({
          key: `preview:graph-source:${index}`,
          title: index ? 'Space and storage notes' : 'Morning work conversation',
          text,
          origin: `https://example.invalid/graph-source/${index}`,
          attribution: 'Fictional owner',
          capturedAt: new Date(),
          available: true,
        }),
      ),
    );
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const subject = await db.history.reference(snapshot, page);
  await topicActions(db, { author }).promote({
    key: 'preview:graph-topic',
    subject,
    title: 'Studio routine',
    rationale: 'A recurring area of inquiry.',
  });
  for (const [index, document] of documents.entries()) {
    const source = await db.history.reference(snapshot, document);
    await wiki.referencePage(`preview:graph-reference:${index}`, page, source);
    await wiki.review({
      key: `preview:graph-review:${index}`,
      assertion: {
        target: await db.history.reference(snapshot, paragraphs[index]!),
        format: 'wiki-text-utf16-v1',
        start: 0,
        end: claims[index]!.length,
      },
      passages: [
        { target: source, format: 'source-text-utf16-v1', start: 0, end: passages[index]!.length },
      ],
      result: 'supported',
      rationale: 'The captured fictional account supports this statement.',
    });
  }
  await db.transaction({ author }, (tx) =>
    tx.entities.sourceDocuments.update({
      ...documents[0]!,
      text: 'My schedule changed. Mornings now include calls; afternoons are the quietest time for hand-tool work.',
    }),
  );
}
