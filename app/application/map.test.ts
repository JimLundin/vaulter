import { expect, test } from 'vitest';
import { createMemoryStorage, sameEntity } from '@/vault/eav/index.ts';
import { createCoordinates, readCoordinates } from '@/map/index.ts';
import { createEvent } from '@/calendar/index.ts';
import { createApplicationIdentities } from './identities.ts';
import { applicationDatabase, applicationMap } from './composition.ts';

test('Application retains coordinates on another owner in its shared journal', async () => {
  await using db = await applicationDatabase(createMemoryStorage());
  const event = await createEvent(db, {
    title: 'Meeting',
    description: '',
    status: 'planned',
    time: { kind: 'unknown' },
  });
  const snapshot = (await db.history.transactions.first({ select: {} }))!;
  const subject = await db.history.reference(snapshot, event);
  await createCoordinates(db, {
    subject,
    coordinates: { kind: 'geographic', crs: 'EPSG:4326', latitude: 0, longitude: 0 },
  });
  expect(await readCoordinates(db, { subject })).toMatchObject([
    {
      subject,
      coordinates: { latitude: 0, longitude: 0 },
    },
  ]);
});

test('Map UI composition supplies record choices and attributes writes to the configured user', async () => {
  const storage = createMemoryStorage();
  await using db = await applicationDatabase(storage);
  const setup = createApplicationIdentities(() => Promise.resolve(db));
  await setup.ensure();
  const event = await createEvent(db, {
    title: 'Meeting place',
    description: '',
    status: 'planned',
    time: { kind: 'unknown' },
  });
  const map = applicationMap(storage);
  const data = await map.read();
  const subject = data.subjects.find((choice) => choice.label === 'Meeting place')!;
  await map.actions.create({
    subject: subject.reference,
    coordinates: { kind: 'geographic', crs: 'EPSG:4326', latitude: 0, longitude: 0 },
  });
  const updated = await map.read();
  expect(updated.entries).toMatchObject([
    { label: 'Meeting place', record: { coordinates: { latitude: 0, longitude: 0 } } },
  ]);
  const reference = await db.history.resolve(updated.entries[0]!.record.subject);
  expect(sameEntity(reference.entity, event)).toBe(true);
  const latest = await db.history.transactions.first({
    select: { author: true },
    orderBy: [{ sequence: 'desc' }],
  });
  const binding = await db.entities.actorBindings.first({
    where: { key: { eq: setup.identities.user } },
    select: { actor: true },
  });
  expect(sameEntity(latest!.author!, binding!.actor)).toBe(true);
});
