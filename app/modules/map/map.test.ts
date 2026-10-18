import { expect, test } from 'vitest';
import {
  e,
  openDatabase,
  createPersistentStorage,
  sameEntity,
  type Journal,
  type HistoricalReference,
} from '@/core/store/index.ts';
import {
  mapEntities,
  mapSchema,
  parseCoordinates,
  createCoordinates,
  reviseCoordinates,
  removeCoordinates,
  readCoordinates,
  type CoordinateValue,
} from './index.ts';

const Subject = e.entity('test.mapSubject', { title: e.string() });
const schema = e.registry({ subjects: Subject, ...mapEntities });
const stockholm: CoordinateValue = {
  kind: 'geographic',
  crs: 'EPSG:4326',
  latitude: 59.3293,
  longitude: 18.0686,
};

test('latitude and longitude retain decimal or DMS representation and reject other systems', () => {
  for (const value of [
    stockholm,
    {
      kind: 'geographic',
      crs: 'EPSG:4326',
      latitude: { degrees: 59, minutes: 19, seconds: 45.48, hemisphere: 'N' },
      longitude: { degrees: 18, minutes: 4, seconds: 6.96, hemisphere: 'E' },
      expression: '59°19′45.48″N 18°4′6.96″E',
    },
  ])
    expect(parseCoordinates(value)).toEqual(value);
  for (const invalid of [
    { ...stockholm, crs: '' },
    { ...stockholm, crs: 'EPSG:4269' },
    { ...stockholm, latitude: 91 },
    { ...stockholm, longitude: Number.POSITIVE_INFINITY },
    { ...stockholm, longitude: Number.NaN },
    { ...stockholm, latitude: { degrees: 90, minutes: 0, seconds: 1, hemisphere: 'N' } },
    { ...stockholm, latitude: { degrees: 12, minutes: 0, seconds: 0, hemisphere: 'E' } },
    { ...stockholm, longitude: { degrees: 18, minutes: 60, seconds: 0, hemisphere: 'E' } },
    { ...stockholm, height: { value: 2, unit: 'metre' } },
    { ...stockholm, x: 1 },
    { kind: 'projected', crs: 'EPSG:3006', easting: 1, northing: 2 },
  ])
    expect(() => parseCoordinates(invalid)).toThrow();
});

test('spatial qualification preserves source precision independently of coordinate expression', () => {
  const qualified = { ...stockholm, expression: 'A street in Stockholm', qualification: 'street' };
  expect(parseCoordinates(qualified)).toEqual(qualified);
  expect(parseCoordinates(stockholm)).not.toHaveProperty('qualification');
  for (const qualification of ['city', 'exact', 100, null])
    expect(() => parseCoordinates({ ...stockholm, qualification })).toThrow();
});

test('durable reopen retains spatial qualification and independently reads its correction history', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'map-qualification-reopen',
      load: async () => structuredClone(journal),
      append: (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
        return Promise.resolve();
      },
    });
  const qualified: CoordinateValue = { ...stockholm, qualification: 'street' };
  let qualifiedSequence: number;
  {
    await using db = await openDatabase({ schema, storage: storage() });
    const subject = await db.transaction((tx) => tx.entities.subjects.insert({ title: 'Street' }));
    const snapshot = (await db.history.transactions.first({ select: {} }))!;
    const coordinate = await createCoordinates(db, {
      subject: await db.history.reference(snapshot, subject),
      coordinates: qualified,
    });
    qualifiedSequence = (await db.history.transactions.first({
      select: { sequence: true },
      orderBy: [{ sequence: 'desc' }],
    }))!.sequence;
    await reviseCoordinates(db, coordinate, stockholm);
  }
  await using db = await openDatabase({ schema, storage: storage() });
  expect(await readCoordinates(db)).toMatchObject([{ coordinates: stockholm }]);
  expect((await readCoordinates(db))[0]!.coordinates).not.toHaveProperty('qualification');
  const snapshot = await db.history.transactions.first({
    select: {},
    where: { sequence: { eq: qualifiedSequence } },
  });
  expect(snapshot).toBeDefined();
  expect(await readCoordinates(db, { snapshot: snapshot! })).toMatchObject([
    { coordinates: qualified },
  ]);
});

test('positions stay attached across subject snapshots and deletion, corrections retain history', async () => {
  await using db = await openDatabase({ schema });
  const subject = await db.transaction((tx) => tx.entities.subjects.insert({ title: 'Venue' }));
  const first = (await db.history.transactions.first({ select: {} }))!;
  const address = await db.history.reference(first, subject);
  const coordinate = await createCoordinates(db, { subject: address, coordinates: stockholm });
  const original = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await db.transaction((tx) => tx.entities.subjects.update({ ...subject, title: 'Renamed venue' }));
  const renamed = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const renamedAddress = await db.history.reference(renamed, subject);
  await createCoordinates(db, {
    subject: renamedAddress,
    coordinates: { ...stockholm, latitude: 59 },
  });
  expect(await readCoordinates(db, { subject: renamedAddress })).toHaveLength(2);
  await reviseCoordinates(db, coordinate, { ...stockholm, latitude: 60 });
  await db.transaction(async (tx) => {
    const current = await tx.entities.subjects.get(subject, { select: {} });
    await tx.entities.subjects.delete(current!);
  });
  const live = await readCoordinates(db, { subject: address });
  expect(live).toHaveLength(2);
  expect(live.map((record) => record.coordinates.latitude)).toContain(60);
  await removeCoordinates(db, coordinate);
  expect(await readCoordinates(db, { subject: address })).toHaveLength(1);
  expect(await readCoordinates(db, { snapshot: original })).toMatchObject([
    { coordinates: stockholm, subject: address },
  ]);
  await expect(reviseCoordinates(db, coordinate, stockholm)).rejects.toThrow('unavailable');
});

test('missing or foreign subjects cannot publish orphan positions', async () => {
  await using foreign = await openDatabase({ schema });
  const subject = await foreign.transaction((tx) =>
    tx.entities.subjects.insert({ title: 'Foreign' }),
  );
  const snapshot = (await foreign.history.transactions.first({ select: {} }))!;
  const address = await foreign.history.reference(snapshot, subject);
  await using db = await openDatabase({ schema });
  await expect(
    createCoordinates(db, { subject: address, coordinates: stockholm }),
  ).rejects.toThrow();
  await expect(
    createCoordinates(db, {
      // @ts-expect-error A subject is mandatory even when bypassing the typed interface.
      subject: undefined,
      coordinates: stockholm,
    }),
  ).rejects.toThrow();
  expect(await readCoordinates(db)).toEqual([]);
  expect(await db.history.transactions.query({ select: {} })).toEqual([]);
});

test('durable reopen preserves attached coordinates and filters out unrelated subjects', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'map-reopen',
      load: async () => structuredClone(journal),
      append: (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
        return Promise.resolve();
      },
    });
  let address: HistoricalReference;
  {
    await using db = await openDatabase({ schema, storage: storage() });
    const subjects = await db.transaction(async (tx) => [
      await tx.entities.subjects.insert({ title: 'A' }),
      await tx.entities.subjects.insert({ title: 'B' }),
    ]);
    const snapshot = (await db.history.transactions.first({ select: {} }))!;
    address = await db.history.reference(snapshot, subjects[0]!);
    for (const subject of subjects) {
      // biome-ignore lint/performance/noAwaitInLoops: Independent publications must accept sequentially.
      await createCoordinates(db, {
        subject: await db.history.reference(snapshot, subject),
        coordinates: stockholm,
      });
    }
  }
  await using db = await openDatabase({ schema, storage: storage() });
  expect(await readCoordinates(db)).toHaveLength(2);
  expect(await readCoordinates(db, { subject: address })).toMatchObject([
    { coordinates: stockholm },
  ]);
});

test('an empty standalone Map has no positions', async () => {
  await using db = await openDatabase({ schema: mapSchema });
  expect(await readCoordinates(db)).toEqual([]);
});

test('failed coordinate publication retains attribution and does not accept or replay the write', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  let attempts = 0;
  const storage = createPersistentStorage({
    scope: 'map-failure',
    load: async () => structuredClone(journal),
    append: (request) => {
      attempts++;
      if (attempts === 2) return Promise.reject(new Error('Publication unavailable'));
      journal = structuredClone({
        schemas: request.schemas,
        commits: [...journal.commits, request.commit],
      });
      return Promise.resolve();
    },
  });
  await using db = await openDatabase({ schema, storage });
  const subject = await db.transaction((tx) =>
    tx.entities.subjects.insert({ title: 'Author and subject' }),
  );
  const snapshot = (await db.history.transactions.first({ select: {} }))!;
  const address = await db.history.reference(snapshot, subject);
  await expect(
    createCoordinates(db, { subject: address, coordinates: stockholm }, { author: subject }),
  ).rejects.toThrow('Publication unavailable');
  expect(attempts).toBe(2);
  expect(await readCoordinates(db)).toEqual([]);
  await createCoordinates(db, { subject: address, coordinates: stockholm }, { author: subject });
  const accepted = await db.history.transactions.first({
    select: { author: true },
    orderBy: [{ sequence: 'desc' }],
  });
  expect(sameEntity(accepted!.author!, subject)).toBe(true);
  expect(await readCoordinates(db)).toHaveLength(1);
});
