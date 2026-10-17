import { sameEntity, type TransactionRef } from '@/vault/eav/index.ts';
import type { CalendarDatabase, CalendarReading } from './schema.ts';
import { parseTime, parseDay, parseTimezone, timeDays, daysInMonth } from './time.ts';

/** Use a single accepted snapshot for events, roles, provenance and recurrences. */
export async function readCalendar(db: CalendarDatabase, snapshot?: TransactionRef) {
  const latest =
    snapshot ??
    (await db.history.transactions.first({ select: {}, orderBy: [{ sequence: 'desc' }] }));
  return readCalendarView(latest ? db.at(latest) : db);
}

async function readCalendarView(view: CalendarReading) {
  const [events, roles, sources, annualDates] = await Promise.all([
    view.entities.calendarEvents.query({
      limit: null, // Calendar assembly must join complete roles, sources and annual dates before window filtering.
      select: {
        title: true,
        description: true,
        status: true,
        time: true,
        reportedTime: true,
        available: true,
      },
      where: { available: { eq: true } },
    }),
    view.entities.calendarEventRoles.query({
      limit: null, // Calendar assembly must join complete roles, sources and annual dates before window filtering.
      select: { event: true, subject: true, kind: true, role: true, order: true },
      orderBy: [{ order: 'asc' }],
    }),
    view.entities.calendarEventSources.query({
      limit: null, // Calendar assembly must join complete roles, sources and annual dates before window filtering.
      select: { event: true, source: true },
    }),
    view.entities.calendarAnnualDates.query({
      limit: null, // Calendar assembly must join complete roles, sources and annual dates before window filtering.
      select: { title: true, month: true, day: true, subject: true, expression: true },
      where: { available: { eq: true } },
    }),
  ]);
  return {
    events: events.map((event) => ({
      ...event,
      time: parseTime(event.time),
      reportedTime: event.reportedTime === undefined ? undefined : parseTime(event.reportedTime),
      roles: roles.filter((role) => sameEntity(role.event, event)),
      sources: sources.filter((source) => sameEntity(source.event, event)),
    })),
    annualDates,
  };
}

export interface CalendarWindow {
  start: string;
  end: string;
  timezone: string;
}

/** Inclusive civil-date window; imprecise coverage remains visibly imprecise. */
export async function readTimeline(
  db: CalendarDatabase,
  window: CalendarWindow,
  snapshot?: TransactionRef,
) {
  const start = parseDay(window.start);
  const end = parseDay(window.end);
  if (start > end) throw new Error('Calendar window is reversed');
  const timezone = parseTimezone(window.timezone);
  const calendar = await readCalendar(db, snapshot);
  const dated = calendar.events
    .flatMap((event) => {
      const coverage = timeDays(event.time, timezone);
      return coverage && coverage.start <= end && coverage.end >= start
        ? [{ event, coverage }]
        : [];
    })
    .sort((a, b) => a.coverage.start.localeCompare(b.coverage.start));
  const recurring = calendar.annualDates
    .flatMap((annualDate) => {
      const dates: string[] = [];
      for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year++) {
        if (annualDate.day > daysInMonth(year, annualDate.month)) continue;
        const date = `${String(year).padStart(4, '0')}-${String(annualDate.month).padStart(2, '0')}-${String(annualDate.day).padStart(2, '0')}`;
        if (date >= start && date <= end) dates.push(date);
      }
      return dates.map((date) => ({ annualDate, date }));
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    dated,
    recurring,
    undated: calendar.events.filter((event) => event.time.kind === 'unknown'),
  };
}
