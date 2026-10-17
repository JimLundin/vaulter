import { expect, test } from 'vitest';
import { createMemoryStorage } from '@/vault/eav/index.ts';
import { createCoordinates, readCoordinates } from '@/map/index.ts';
import { createEvent } from '@/calendar/index.ts';
import { applicationDatabase } from './composition.ts';

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
