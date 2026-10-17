import { applicationCalendar } from '@/application/composition.ts';
import { createEvent, createAnnualDate } from '@/calendar/index.ts';
import type { MemoryStorage } from '@/vault/eav/index.ts';

/** Fictional data uses the same Calendar operations as the product. */
export async function seedCalendar(storage: MemoryStorage) {
  const db = await applicationCalendar(storage).database();
  if (await db.entities.calendarEvents.first({ select: {} })) return;
  const page = await db.entities.wikiPages.first({
    where: { key: { eq: 'preview:page:0' } },
    select: {},
  });
  const snapshot = await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  });
  const subject = page && snapshot ? await db.history.reference(snapshot, page) : undefined;
  const roles = subject ? [{ subject, kind: 'place' as const, role: 'venue', order: 0 }] : [];
  await createEvent(db, {
    title: 'Studio open afternoon',
    description: 'Invite neighbours over for tea and a look at the studio.',
    status: 'planned',
    time: {
      kind: 'point',
      point: { precision: 'day', year: 2026, month: 10, day: 24 },
      approximate: false,
    },
    roles,
  });
  await createEvent(db, {
    title: 'First sketch of the studio',
    description: 'The idea started with a quiet space at the end of the garden.',
    status: 'occurred',
    time: {
      kind: 'point',
      point: { precision: 'month', year: 2026, month: 6 },
      approximate: true,
      expression: 'around the middle of June',
    },
    roles,
  });
  await createEvent(db, {
    title: 'Autumn planting',
    description: 'Choose bulbs for the border beside the studio.',
    status: 'planned',
    time: {
      kind: 'range',
      start: { precision: 'day', year: 2026, month: 10, day: 18 },
      end: { precision: 'day', year: 2026, month: 10, day: 31 },
      approximate: true,
      expression: 'later this month',
    },
    roles,
  });
  await createEvent(db, {
    title: 'Window fitting',
    description: 'Waiting for the installer to confirm a new date.',
    status: 'unknown',
    time: { kind: 'unknown', expression: 'to be confirmed' },
    roles,
  });
  await createAnnualDate(db, {
    title: 'Studio anniversary',
    month: 10,
    day: 12,
    ...(subject && { subject }),
  });
}
