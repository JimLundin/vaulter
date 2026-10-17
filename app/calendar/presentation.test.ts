import { expect, test } from 'vitest';
import { openDatabase } from '@/vault/eav/index.ts';
import { calendarSchema, createEvent, readCalendar } from './index.ts';
import { calendarEntries, formatTime } from './presentation.ts';

test('month cells receive only exact day/instant entries while approximate and unknown values keep their meaning', async () => {
  await using db = await openDatabase({ schema: calendarSchema });
  await createEvent(db, {
    title: 'Approximate',
    description: '',
    status: 'planned',
    time: {
      kind: 'point',
      point: { precision: 'month', year: 2026, month: 6 },
      approximate: true,
      expression: 'middle of June',
    },
  });
  await createEvent(db, {
    title: 'Call',
    description: '',
    status: 'occurred',
    time: {
      kind: 'point',
      point: { precision: 'instant', value: '2026-06-01T23:30:00Z' },
      approximate: false,
    },
  });
  const entries = calendarEntries(await readCalendar(db), 2026, 'Europe/Stockholm');
  expect(entries.find((item) => item.title === 'Approximate')).toMatchObject({
    exactDay: false,
    day: undefined,
    date: 'Around June 2026 · “middle of June”',
  });
  expect(entries.find((item) => item.title === 'Call')).toMatchObject({
    exactDay: true,
    day: '2026-06-02',
  });
  expect(formatTime({ kind: 'unknown', expression: 'sometime later' }, 'UTC')).toBe(
    'Date unknown · sometime later',
  );
});
