import { expect, test } from 'vitest';
import { e, openDatabase, createPersistentStorage, type Journal } from '@/core/store/index.ts';
import {
  calendarEntities,
  calendarSchema,
  createEvent,
  reviseEvent,
  removeEvent,
  createAnnualDate,
  reviseAnnualDate,
  readCalendar,
  readTimeline,
  parseTime,
  type TimeValue,
} from './index.ts';

const june: TimeValue = {
  kind: 'point',
  point: { precision: 'month', year: 2026, month: 6 },
  approximate: true,
  expression: 'around the middle of June',
};
const window = { start: '2026-06-01', end: '2026-06-30', timezone: 'Europe/Stockholm' };

test('time retains precision and wording and rejects invented or invalid normalization', () => {
  expect(parseTime(june)).toEqual(june);
  expect(parseTime({ kind: 'unknown', expression: 'this autumn' })).toEqual({
    kind: 'unknown',
    expression: 'this autumn',
  });
  for (const invalid of [
    {
      kind: 'point',
      point: { precision: 'day', year: 2026, month: 2, day: 29 },
      approximate: false,
    },
    { kind: 'point', point: { precision: 'year', year: 2026, month: 6 }, approximate: false },
    {
      kind: 'point',
      point: { precision: 'instant', value: '2026-06-01T12:00:00' },
      approximate: false,
    },
    { kind: 'unknown', start: '2026-01-01' },
    {
      kind: 'range',
      start: { precision: 'year', year: 2027 },
      end: { precision: 'year', year: 2026 },
      approximate: false,
    },
  ])
    expect(() => parseTime(invalid)).toThrow();
});

test('a passed plan stays planned, postponement retains history, removal hides only current reading', async () => {
  await using db = await openDatabase({ schema: calendarSchema });
  const event = await createEvent(db, {
    title: 'Procedure',
    description: 'Reported plan',
    status: 'planned',
    time: june,
    reportedTime: {
      kind: 'point',
      point: { precision: 'day', year: 2026, month: 5, day: 2 },
      approximate: false,
    },
  });
  const original = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  expect((await readTimeline(db, window)).dated[0]).toMatchObject({
    event: { status: 'planned', time: june },
    coverage: { start: '2026-06-01', end: '2026-06-30' },
  });
  await reviseEvent(db, event, {
    time: { kind: 'unknown', expression: 'postponed until further notice' },
  });
  expect((await readTimeline(db, window)).undated[0]).toMatchObject({
    status: 'planned',
    time: { kind: 'unknown' },
  });
  await removeEvent(db, event);
  expect((await readCalendar(db)).events).toEqual([]);
  expect((await readCalendar(db, original)).events[0]).toMatchObject({
    title: 'Procedure',
    status: 'planned',
    time: june,
  });
});

test('annual birthdays have no invented birth year or persisted occurrences and skip non-leap years', async () => {
  await using db = await openDatabase({ schema: calendarSchema });
  await createAnnualDate(db, { title: 'Birthday', month: 2, day: 29 });
  const read = (start: string, end: string) => readTimeline(db, { start, end, timezone: 'UTC' });
  expect((await read('2025-01-01', '2025-12-31')).recurring).toEqual([]);
  expect((await read('2024-01-01', '2028-12-31')).recurring.map((item) => item.date)).toEqual([
    '2024-02-29',
    '2028-02-29',
  ]);
  expect((await readCalendar(db)).events).toEqual([]);
  expect(() => createAnnualDate(db, { title: 'Impossible', month: 4, day: 31 })).toThrow();
});

test('timeline uses explicit civil timezone and leaves unknowns outside dated results', async () => {
  await using db = await openDatabase({ schema: calendarSchema });
  await createEvent(db, {
    title: 'Call',
    description: '',
    status: 'occurred',
    time: {
      kind: 'point',
      point: { precision: 'instant', value: '2026-06-01T23:30:00Z', timezone: 'Europe/Stockholm' },
      approximate: false,
    },
  });
  await createEvent(db, {
    title: 'Unknown',
    description: '',
    status: 'unknown',
    time: { kind: 'unknown' },
  });
  const read = (timezone: string) =>
    readTimeline(db, { start: '2026-06-01', end: '2026-06-01', timezone });
  expect((await read('UTC')).dated).toHaveLength(1);
  expect((await read('Europe/Stockholm')).dated).toEqual([]);
  expect((await read('Europe/Stockholm')).undated).toHaveLength(1);
  await expect(read('Invalid/Zone')).rejects.toThrow();
  await expect(readTimeline(db, { ...window, end: '2026-02-30' })).rejects.toThrow();
});

test('durable reopen retains exact subjects, role ordering, provenance and historical plans', async () => {
  const Subject = e.entity('test.subject', { name: e.string() });
  const schema = e.registry({ subjects: Subject, ...calendarEntities });
  let journal: Journal = { schemas: [], commits: [] };
  const storage = () =>
    createPersistentStorage({
      scope: 'calendar-test',
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
    const subject = await db.transaction((tx) => tx.entities.subjects.insert({ name: 'Alex' }));
    const snapshot = (await db.history.transactions.first({ select: {} }))!;
    const address = await db.history.reference(snapshot, subject);
    await createEvent(db, {
      title: 'Visit',
      description: '',
      status: 'planned',
      time: june,
      roles: [
        { subject: address, kind: 'participant', role: 'visitor', order: 2 },
        { subject: address, kind: 'place', role: 'venue', order: 0 },
      ],
      sources: [address],
    });
    await db.transaction((tx) => tx.entities.subjects.delete(subject));
  }
  await using reopened = await openDatabase({ schema, storage: storage() });
  const event = (await readCalendar(reopened)).events[0]!;
  expect(event).toMatchObject({ status: 'planned', time: june });
  expect(event.roles.map((role) => role.role)).toEqual(['venue', 'visitor']);
  const reference = await reopened.history.resolve(event.roles[0]!.subject);
  expect(await reopened.history.inspect(reference.transaction, reference.entity)).toMatchObject({
    values: { name: 'Alex' },
  });
  expect(event.sources).toHaveLength(1);
});

test('invalid foreign participant aborts the whole event and role publication', async () => {
  const Subject = e.entity('test.subject', { name: e.string() });
  const schema = e.registry({ subjects: Subject, ...calendarEntities });
  await using foreign = await openDatabase({ schema });
  const subject = await foreign.transaction((tx) =>
    tx.entities.subjects.insert({ name: 'Foreign' }),
  );
  const snapshot = (await foreign.history.transactions.first({ select: {} }))!;
  const address = await foreign.history.reference(snapshot, subject);
  await using db = await openDatabase({ schema });
  await expect(
    createEvent(db, {
      title: 'Invalid',
      description: '',
      status: 'planned',
      time: june,
      roles: [{ subject: address, kind: 'participant', role: 'guest', order: 0 }],
    }),
  ).rejects.toThrow();
  expect((await readCalendar(db)).events).toEqual([]);
});

test('ranges overlap the window without turning their endpoints into recurrence or exact times', async () => {
  await using db = await openDatabase({ schema: calendarSchema });
  const time: TimeValue = {
    kind: 'range',
    start: { precision: 'month', year: 2026, month: 5 },
    end: { precision: 'month', year: 2026, month: 7 },
    approximate: true,
    expression: 'sometime from May to July',
  };
  await createEvent(db, { title: 'Trip', description: '', status: 'planned', time });
  const result = await readTimeline(db, window);
  expect(result.dated[0]).toMatchObject({
    event: { time },
    coverage: { start: '2026-05-01', end: '2026-07-31' },
  });
  expect(result.recurring).toEqual([]);
  await expect(readTimeline(db, { ...window, start: '2026-07-01' })).rejects.toThrow('reversed');
});

test('failed durable acceptance publishes no event and never reruns the write callback', async () => {
  let attempts = 0;
  const storage = createPersistentStorage({
    scope: 'calendar-failure',
    load: async () => ({ schemas: [], commits: [] }),
    append: () => {
      attempts++;
      return Promise.reject(new Error('Publication unavailable'));
    },
  });
  await using db = await openDatabase({ schema: calendarSchema, storage });
  await expect(
    createEvent(db, { title: 'Unsaved', description: '', status: 'planned', time: june }),
  ).rejects.toThrow();
  expect(attempts).toBe(1);
  expect((await readCalendar(db)).events).toEqual([]);
});

test('correcting or hiding an annual date preserves its historical recurrence', async () => {
  await using db = await openDatabase({ schema: calendarSchema });
  const date = await createAnnualDate(db, { title: 'Anniversary', month: 6, day: 30 });
  const original = (await db.history.transactions.first({ select: {} }))!;
  await expect(reviseAnnualDate(db, date, { month: 2 })).rejects.toThrow('Invalid annual date');
  await reviseAnnualDate(db, date, { day: 15 });
  expect((await readTimeline(db, window)).recurring[0]!.date).toBe('2026-06-15');
  await reviseAnnualDate(db, date, { available: false });
  expect((await readTimeline(db, window)).recurring).toEqual([]);
  expect((await readTimeline(db, window, original)).recurring[0]!.date).toBe('2026-06-30');
});
