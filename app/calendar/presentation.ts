import type { TimeValue, TimePoint } from './time.ts';
import { timeDays, daysInMonth } from './time.ts';
import type { readCalendar } from './reading.ts';
import { sameEntity, type EntityRef, type EntityDefinition } from '@/vault/eav/index.ts';

export type CalendarData = Awaited<ReturnType<typeof readCalendar>>;
export type CalendarEvent = CalendarData['events'][number];
export interface CalendarEntry {
  id: string;
  title: string;
  date: string;
  status: string;
  description?: string;
  event?: CalendarEvent;
  day?: string;
  coverage?: { start: string; end: string };
  exactDay: boolean;
  timezone?: string;
}

function entryKey(
  entity: EntityRef<EntityDefinition>,
  identities: Map<string, WeakRef<EntityRef<EntityDefinition>>>,
): string {
  for (const [key, reference] of identities) {
    const previous = reference.deref();
    if (!previous) identities.delete(key);
    else if (sameEntity(previous, entity)) return key;
  }
  const key = crypto.randomUUID();
  identities.set(key, new WeakRef(entity));
  return key;
}

const identities = new Map<string, WeakRef<EntityRef<EntityDefinition>>>();

export function formatTime(value: TimeValue, timezone: string): string {
  const point = (p: TimePoint): string => {
    if (p.precision === 'year') return String(p.year);
    if (p.precision === 'instant')
      return new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(p.value));
    const month = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2000, p.month - 1, 1)),
    );
    return p.precision === 'month' ? `${month} ${p.year}` : `${p.day} ${month} ${p.year}`;
  };
  if (value.kind === 'unknown')
    return value.expression ? `Date unknown · ${value.expression}` : 'Date unknown';
  const normalized =
    value.kind === 'point' ? point(value.point) : `${point(value.start)} – ${point(value.end)}`;
  return `${value.approximate ? 'Around ' : ''}${normalized}${value.expression ? ` · “${value.expression}”` : ''}`;
}

export function calendarEntries(
  data: CalendarData,
  year: number,
  timezone: string,
): CalendarEntry[] {
  const events = data.events.map((event): CalendarEntry => {
    const coverage = timeDays(event.time, timezone);
    const exactDay =
      event.time.kind === 'point' &&
      !event.time.approximate &&
      ['day', 'instant'].includes(event.time.point.precision);
    return {
      id: `event-${entryKey(event, identities)}`,
      title: event.title,
      date: formatTime(event.time, timezone),
      status: event.status,
      description: event.description,
      event,
      coverage,
      day: exactDay ? coverage?.start : undefined,
      exactDay,
      timezone,
    };
  });
  const annual = data.annualDates.flatMap((item): CalendarEntry[] => {
    if (item.day > daysInMonth(year, item.month)) return [];
    const day = `${String(year).padStart(4, '0')}-${String(item.month).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`;
    return [
      {
        id: `annual-${entryKey(item, identities)}`,
        title: item.title,
        date: `${item.day} ${new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, item.month - 1, 1)))} · every year`,
        status: 'Annual date',
        exactDay: true,
        day,
        coverage: { start: day, end: day },
      },
    ];
  });
  return [...events, ...annual].sort((a, b) =>
    (a.coverage?.start ?? '9999').localeCompare(b.coverage?.start ?? '9999'),
  );
}

export function monthWindow(month: string) {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  return {
    start: `${month}-01`,
    end: `${month}-${daysInMonth(year, number)}`,
    year,
    month: number,
  };
}
