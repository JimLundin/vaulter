import { expect, test } from 'vitest';
import {
  e,
  openDatabase,
  createPersistentStorage,
  sameEntity,
  type Journal,
} from '@/core/store/index.ts';
import {
  observationEntities,
  createObservation,
  reviseObservation,
  removeObservation,
  readObservations,
  parseObservation,
  type ObservationValue,
} from './index.ts';

const Source = e.entity('test.observationSource', { title: e.string() });
const schema = e.registry({ sources: Source, ...observationEntities });
const weather: ObservationValue = {
  subject: 'weather',
  source: { kind: 'application', name: 'Weather collector' },
  time: { requested: null, observed: '2026-10-04T22:05:00+02:00', received: null, elapsedMs: null },
  outcome: {
    status: 'collected',
    value: {
      latitude: 59.3,
      longitude: 18.1,
      intervalSeconds: null,
      temperatureC: 11.4,
      apparentTemperatureC: 8.2,
      humidityPercent: 71,
      precipitationMm: 0,
      cloudPercent: 67,
      windMps: 4.4,
      daylight: false,
      raw: { temp_c: 11.4, conditions: 'partly cloudy' },
    },
    quality: { method: 'coordinates of the place page' },
  },
};

test('typed values retain missing fields, raw metadata, clock precision and explicit missing outcomes', () => {
  expect(parseObservation(weather)).toEqual(weather);
  expect(
    parseObservation({
      subject: 'host',
      source: { kind: 'application' },
      time: {},
      outcome: { status: 'failed', reason: 'Collector unavailable', value: null },
    }),
  ).toEqual({
    subject: 'host',
    source: { kind: 'application' },
    time: {},
    outcome: { status: 'failed', reason: 'Collector unavailable', value: null },
  });
  const minute = { ...weather, time: { observed: '2026-10-04T22:05+02:00' } };
  expect(parseObservation(minute).time.observed).toBe('2026-10-04T22:05+02:00');
  for (const invalid of [
    { ...weather, time: { observed: '2026-10-04T22:05:00' } },
    { ...weather, time: { elapsedMs: -1 } },
    { ...weather, subject: 'person-location' },
    { ...weather, outcome: { status: 'collected', value: { latitude: 91 } } },
    { ...weather, outcome: { status: 'collected', value: { humidityPercent: 101 } } },
  ])
    expect(() => parseObservation(invalid)).toThrow();
});

test('independent reopen preserves revisions, provenance, explicit nulls and removed readings', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'observation-reopen',
      load: async () => structuredClone(journal),
      append: (request) => {
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
        return Promise.resolve();
      },
    });
  await using db = await openDatabase({ schema, storage: storage() });
  const source = await db.transaction((tx) =>
    tx.entities.sources.insert({ title: 'External dialogue' }),
  );
  const sourceTx = (await db.history.transactions.first({ select: {} }))!;
  const provenance = await db.history.reference(sourceTx, source);
  const original = await createObservation(db, { value: weather, provenance, context: provenance });
  const originalTx = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const originalAddress = await db.history.reference(originalTx, original);
  await reviseObservation(db, original, { ...weather, outcome: { status: 'unknown' }, time: {} });
  await db.transaction(async (tx) => {
    const current = (await tx.entities.sources.get(source, { select: {} }))!;
    await tx.entities.sources.delete(current);
  });
  const host = await createObservation(db, {
    value: {
      subject: 'host',
      source: { kind: 'application' },
      time: {},
      outcome: { status: 'collected', value: { os: 'Linux', timezone: null } },
    },
  });
  await removeObservation(db, original);
  await expect(reviseObservation(db, original, weather)).rejects.toThrow('unavailable');
  await using reopened = await openDatabase({ schema, storage: storage() });
  const selected = await reopened.history.resolve(originalAddress);
  const historical = await readObservations(reopened, { snapshot: selected.transaction });
  expect(historical).toMatchObject([
    { value: weather, provenance, context: provenance, available: true },
  ]);
  const retained = await readObservations(reopened, {
    context: provenance,
    includeUnavailable: true,
  });
  expect(retained).toMatchObject([
    { value: { subject: 'weather', time: {}, outcome: { status: 'unknown' } }, available: false },
  ]);
  expect(sameEntity(historical[0]!.ref, retained[0]!.ref)).toBe(true);
  const current = await readObservations(reopened);
  expect(current).toHaveLength(1);
  expect(
    sameEntity(
      current[0]!.ref,
      (
        await reopened.history.resolve(
          await db.history.reference(
            (await db.history.transactions.first({ select: {}, orderBy: [{ sequence: 'desc' }] }))!,
            host,
          ),
        )
      ).entity,
    ),
  ).toBe(true);
  expect(current[0]!.value).toMatchObject({
    subject: 'host',
    time: {},
    outcome: { value: { timezone: null } },
  });
});

test('invalid values and foreign provenance reject admission without a partial record or transaction', async () => {
  await using foreign = await openDatabase({ schema });
  const source = await foreign.transaction((tx) =>
    tx.entities.sources.insert({ title: 'Foreign' }),
  );
  const provenance = await foreign.history.reference(
    (await foreign.history.transactions.first({ select: {} }))!,
    source,
  );
  await using db = await openDatabase({ schema });
  await expect(createObservation(db, { value: weather, provenance })).rejects.toThrow();
  expect(() => createObservation(db, { value: { ...weather, time: { elapsedMs: -1 } } })).toThrow();
  expect(await readObservations(db)).toEqual([]);
  expect(await db.history.transactions.query({ select: {} })).toEqual([]);
});
