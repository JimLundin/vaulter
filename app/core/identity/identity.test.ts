import { expect, test } from 'vitest';
import {
  createPersistentStorage,
  e,
  openDatabase,
  sameEntity,
  type Journal,
} from '@/core/store/index.ts';
import {
  createIdentityRedirect,
  identityEntities,
  resolveCurrentIdentity,
  resolveHistoricalIdentity,
  reviseIdentityRedirect,
} from './index.ts';

const Page = e.entity('identityTest.page', { title: e.string(), available: e.boolean() });
const Task = e.entity('identityTest.task', { text: e.string() });
const schema = e.registry({ ...identityEntities, pages: Page, tasks: Task });

async function fixture(db: Awaited<ReturnType<typeof openDatabase<typeof schema>>>) {
  const records = await db.transaction(async (tx) => ({
    a: await tx.entities.pages.insert({ title: 'Original A', available: true }),
    b: await tx.entities.pages.insert({ title: 'Original B', available: true }),
    c: await tx.entities.pages.insert({ title: 'Original C', available: true }),
    task: await tx.entities.tasks.insert({ text: 'A task' }),
  }));
  const snapshot = (await db.history.transactions.first({ select: {} }))!;
  return {
    ...records,
    aRef: await db.history.reference(snapshot, records.a),
    bRef: await db.history.reference(snapshot, records.b),
    cRef: await db.history.reference(snapshot, records.c),
    taskRef: await db.history.reference(snapshot, records.task),
  };
}

test('current links follow merge chains and current survivor values; historical evidence stays exact', async () => {
  await using db = await openDatabase({ schema });
  const f = await fixture(db);
  await createIdentityRedirect(db, { source: f.aRef, target: f.bRef });
  await createIdentityRedirect(db, { source: f.bRef, target: f.cRef });
  await db.transaction(async (tx) => {
    await tx.entities.pages.update({ ...f.c, title: 'Current survivor' });
    await tx.entities.pages.delete(f.a);
  });
  const current = await resolveCurrentIdentity(db, f.aRef);
  expect(sameEntity(current.entity, f.c)).toBe(true);
  expect(current.record?.values).toMatchObject({ title: 'Current survivor' });
  expect(current.redirects).toHaveLength(2);
  expect(current.available).toBe(true);
  const historical = await resolveHistoricalIdentity(db, f.aRef);
  expect(sameEntity(historical.entity, f.a)).toBe(true);
  expect(historical.record?.values).toMatchObject({ title: 'Original A' });
  // Redirect creation does not consolidate content or erase a source.
  expect(await db.entities.pages.get(f.b, { select: { title: true } })).toMatchObject({
    title: 'Original B',
  });
});

test('cycle, ambiguity, self and cross-type admissions leave no partial publication', async () => {
  await using db = await openDatabase({ schema });
  const f = await fixture(db);
  const redirect = await createIdentityRedirect(db, { source: f.aRef, target: f.bRef });
  const attempts = [
    [{ source: f.aRef, target: f.cRef }, 'Ambiguous'],
    [{ source: f.bRef, target: f.aRef }, 'cycle'],
    [{ source: f.cRef, target: f.cRef }, 'itself'],
    [{ source: f.cRef, target: f.taskRef }, 'same type'],
  ] as const;
  for (const [input, message] of attempts) {
    // biome-ignore lint/performance/noAwaitInLoops: Failed admissions are intentionally observed in sequence.
    await expect(createIdentityRedirect(db, input)).rejects.toThrow(message);
  }
  await expect(reviseIdentityRedirect(db, redirect, { target: f.aRef })).rejects.toThrow('itself');
  expect(await db.entities.identityRedirects.query({ select: {} })).toHaveLength(1);
  expect(await db.history.transactions.query({ select: {} })).toHaveLength(2);
});

test('address snapshot does not disguise duplicate identity and foreign or invalid evidence is rejected', async () => {
  await using db = await openDatabase({ schema });
  await using foreign = await openDatabase({ schema });
  const f = await fixture(db);
  const other = await fixture(foreign);
  await createIdentityRedirect(db, { source: f.aRef, target: f.bRef });
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const laterA = await db.history.reference(snapshot, f.a);
  await expect(createIdentityRedirect(db, { source: laterA, target: f.cRef })).rejects.toThrow(
    'Ambiguous',
  );
  for (const input of [
    { source: other.aRef, target: f.bRef },
    { source: f.cRef, target: other.bRef },
    { source: f.cRef, target: f.bRef, provenance: [other.aRef] },
    { source: { ...f.cRef, transaction: 'unaccepted' }, target: f.bRef },
    { source: { ...f.cRef, scope: 'another-scope' }, target: f.bRef },
  ]) {
    // biome-ignore lint/performance/noAwaitInLoops: Inspect atomic rejection before the next admission.
    await expect(createIdentityRedirect(db, input)).rejects.toThrow();
  }
  await expect(resolveCurrentIdentity(db, other.aRef)).rejects.toThrow();
  expect(await db.entities.identityRedirects.query({ select: {} })).toHaveLength(1);
});

test('survivor unavailability never falls back to source and redirect withdrawal is reversible', async () => {
  await using db = await openDatabase({ schema });
  const f = await fixture(db);
  const redirect = await createIdentityRedirect(db, { source: f.aRef, target: f.bRef });
  await db.transaction((tx) => tx.entities.pages.update({ ...f.b, available: false }));
  expect((await resolveCurrentIdentity(db, f.aRef)).available).toBe(false);
  await reviseIdentityRedirect(db, redirect, { available: false });
  expect(sameEntity((await resolveCurrentIdentity(db, f.aRef)).entity, f.a)).toBe(true);
  await reviseIdentityRedirect(db, redirect, { available: true });
  await db.transaction(async (tx) => {
    const current = (await tx.entities.pages.get(f.b, { select: {} }))!;
    await tx.entities.pages.delete(current);
  });
  const removed = await resolveCurrentIdentity(db, f.aRef);
  expect(sameEntity(removed.entity, f.b)).toBe(true);
  expect(removed.available).toBe(false);
  expect(removed.record).toBeUndefined();
  expect((await resolveHistoricalIdentity(db, f.bRef)).record?.values).toMatchObject({
    title: 'Original B',
  });
});

test('concurrent admissions cannot establish conflicting survivors or a cycle', async () => {
  await using db = await openDatabase({ schema });
  const f = await fixture(db);
  const admissions = await Promise.allSettled([
    createIdentityRedirect(db, { source: f.aRef, target: f.bRef }),
    createIdentityRedirect(db, { source: f.aRef, target: f.cRef }),
  ]);
  expect(admissions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const redirect = (await db.entities.identityRedirects.first({
    select: { source: true, target: true },
  }))!;
  await expect(
    createIdentityRedirect(db, { source: redirect.target, target: redirect.source }),
  ).rejects.toThrow('cycle');
  expect(await db.entities.identityRedirects.query({ select: {} })).toHaveLength(1);
});

test('independent durable reopen retains redirect revisions, original evidence and withdrawal history', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'identity-durable-test',
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
    const f = await fixture(db);
    const redirect = await createIdentityRedirect(
      db,
      {
        source: f.aRef,
        target: f.bRef,
        reason: 'Same subject',
        provenance: [f.cRef],
      },
      { author: f.a, origin: f.c },
    );
    await reviseIdentityRedirect(db, redirect, { target: f.cRef, reason: 'Corrected survivor' });
    await reviseIdentityRedirect(db, redirect, { available: false });
  }
  await using reopened = await openDatabase({ schema, storage: storage() });
  const redirect = (await reopened.entities.identityRedirects.first({
    select: { source: true, target: true, reason: true, available: true, provenance: true },
  }))!;
  expect(redirect).toMatchObject({ reason: 'Corrected survivor', available: false });
  expect((await resolveCurrentIdentity(reopened, redirect.source)).record?.values).toMatchObject({
    title: 'Original A',
  });
  const changes = await reopened.history.entities.identityRedirects.query({
    select: { before: { target: true, available: true }, after: { target: true, available: true } },
    limit: null,
  });
  expect(changes).toHaveLength(3);
  const original = changes[0]!.after!;
  expect((await resolveHistoricalIdentity(reopened, original.target)).record?.values).toMatchObject(
    { title: 'Original B' },
  );
  const publication = (
    await reopened.history.transactions.query({
      select: { sequence: true, author: true, origin: true },
    })
  ).find((tx) => tx.sequence === 2)!;
  expect(publication.author).toBeDefined();
  expect(publication.origin).toBeDefined();
  await reviseIdentityRedirect(reopened, redirect, { available: true });
  expect((await resolveCurrentIdentity(reopened, redirect.source)).record?.values).toMatchObject({
    title: 'Original C',
  });
  expect(
    (await resolveHistoricalIdentity(reopened, redirect.provenance[0]!)).record?.values,
  ).toMatchObject({ title: 'Original C' });
});
