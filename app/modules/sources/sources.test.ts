import { expect, test } from 'vitest';
import {
  createPersistentStorage,
  e,
  openDatabase,
  sameEntity,
  type Journal,
} from '@/core/store/index.ts';
import {
  captureSourceDocument,
  createSourceLead,
  documentSources,
  readHistoricalSourceLead,
  readSourceLead,
  readSourceLeads,
  removeSourceLead,
  reviseSourceLead,
  sourceEntities,
  sourceSchema,
} from './index.ts';

const captured = {
  key: 'capture',
  title: 'Fetched document',
  text: 'Actually captured text',
  origin: 'https://example.com',
  attribution: 'Recorded author',
  capturedAt: new Date('2026-10-18T12:00:00Z'),
};

test('URL-only leads retain exact URLs without fabricated capture fields or URL deduplication', async () => {
  await using db = await openDatabase({ schema: sourceSchema });
  // biome-ignore lint/security/noSecrets: Fictional URL exercises exact URL retention.
  const url = 'HTTPS://Example.com:443/A%2fb?b=2&a=1#Fragment';
  const first = await createSourceLead(db, { url });
  const second = await createSourceLead(db, { url });
  expect(sameEntity(first, second)).toBe(false);
  expect(await readSourceLeads(db)).toMatchObject([
    { url, available: true },
    { url, available: true },
  ]);
  expect(await db.entities.sourceDocuments.query({ select: {} })).toEqual([]);
  const transaction = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'asc' }],
  }))!;
  const address = await db.history.reference(transaction, first);
  await expect(documentSources(db)(address)).rejects.toThrow('not an eligible source document');
  for (const invalid of [
    'javascript:alert(1)',
    'https:',
    'https://',
    '/relative',
    'mailto:a@example.com',
    ' https://example.com',
    'https://example.com/\npath',
  ])
    expect(() => createSourceLead(db, { url: invalid })).toThrow('HTTP or HTTPS');
  expect(await readSourceLeads(db)).toHaveLength(2);
});

test('durable reopen preserves revisions, removal, source metadata and the separate linked capture', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'source-leads-test',
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
    await using db = await openDatabase({ schema: sourceSchema, storage: storage() });
    const document = await captureSourceDocument(db, captured);
    const sourceSnapshot = (await db.history.transactions.first({ select: {} }))!;
    const source = await db.history.reference(sourceSnapshot, document);
    const lead = await createSourceLead(db, {
      url: 'https://EXAMPLE.com/original',
      title: 'Original title',
      provenance: { sourcePath: 'links.md', collectedAt: null },
      source,
    });
    const creation = (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }))!;
    const leadAddress = await db.history.reference(creation, lead);
    await reviseSourceLead(db, lead, {
      url: 'https://example.com/revised',
      title: null,
      provenance: { reason: 'Correction' },
    });
    const capture = await captureSourceDocument(db, {
      ...captured,
      key: 'linked-capture',
      lead: leadAddress,
    });
    expect(sameEntity(capture, lead)).toBe(false);
    await removeSourceLead(db, lead);
    await expect(reviseSourceLead(db, lead, { title: 'revived' })).rejects.toThrow('unavailable');
    expect(await readSourceLeads(db)).toEqual([]);
  }
  await using reopened = await openDatabase({ schema: sourceSchema, storage: storage() });
  expect(await readSourceLeads(reopened)).toEqual([]);
  const removed = (await readSourceLeads(reopened, { includeUnavailable: true }))[0]!;
  expect(removed).toMatchObject({
    url: 'https://example.com/revised',
    available: false,
    provenance: { reason: 'Correction' },
  });
  expect(removed.title).toBeUndefined();
  expect(await readSourceLead(reopened, removed)).toMatchObject({ available: false });
  const linked = (
    await reopened.entities.sourceDocuments.query({ select: { key: true, lead: true, text: true } })
  ).find((document) => document.key === 'linked-capture')!;
  const result = await readHistoricalSourceLead(reopened, linked.lead!);
  expect(result.recorded).toMatchObject({
    url: 'https://EXAMPLE.com/original',
    title: 'Original title',
    available: true,
    provenance: { sourcePath: 'links.md', collectedAt: null },
  });
  expect(result.current).toMatchObject({ url: 'https://example.com/revised', available: false });
  const source = await reopened.history.resolve(result.recorded.source!);
  expect(await reopened.history.inspect(source.transaction, source.entity)).toMatchObject({
    values: { text: 'Actually captured text' },
  });
  const creation = (await reopened.history.transactions.query({ select: { sequence: true } })).find(
    (transaction) => transaction.sequence === 2,
  )!;
  expect(await readSourceLeads(reopened, { snapshot: creation })).toMatchObject([
    { title: 'Original title' },
  ]);
});

test('foreign provenance and non-lead capture origins reject the entire publication', async () => {
  const Source = e.entity('test.lead-source', { text: e.string() });
  const schema = e.registry({ ...sourceEntities, sources: Source });
  await using db = await openDatabase({ schema });
  await using foreign = await openDatabase({ schema });
  const source = await foreign.transaction((tx) => tx.entities.sources.insert({ text: 'Foreign' }));
  const snapshot = (await foreign.history.transactions.first({ select: {} }))!;
  const address = await foreign.history.reference(snapshot, source);
  await expect(
    createSourceLead(db, { url: 'https://example.com', source: address }),
  ).rejects.toThrow();
  expect(await readSourceLeads(db)).toEqual([]);
  const document = await captureSourceDocument(db, captured);
  const documentSnapshot = (await db.history.transactions.first({ select: {} }))!;
  await expect(
    captureSourceDocument(db, {
      ...captured,
      lead: await db.history.reference(documentSnapshot, document),
    }),
  ).rejects.toThrow('Source lead');
  expect(await db.entities.sourceDocuments.query({ select: {} })).toHaveLength(1);
});

test('existing document journals reopen without a lead connection or changed evidence reading', async () => {
  const OldDocument = e.entity('source.document', {
    key: e.string(),
    title: e.string(),
    text: e.string(),
    origin: e.string(),
    attribution: e.string(),
    capturedAt: e.datetime(),
    occurredAt: e.string().optional(),
    available: e.boolean(),
  });
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'old-source-document-test',
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
    await using old = await openDatabase({
      schema: e.registry({ sourceDocuments: OldDocument }),
      storage: storage(),
    });
    await old.transaction((tx) =>
      tx.entities.sourceDocuments.insert({ ...captured, available: true }),
    );
  }
  await using db = await openDatabase({ schema: sourceSchema, storage: storage() });
  const original = (
    await db.entities.sourceDocuments.query({ select: { text: true, lead: true } })
  )[0]!;
  expect(original.lead).toBeUndefined();
  const snapshot = (await db.history.transactions.first({ select: {} }))!;
  expect(await documentSources(db)(await db.history.reference(snapshot, original))).toMatchObject({
    recorded: { text: 'Actually captured text', attribution: 'Recorded author' },
  });
});
