import { e, type EntityRef, type DomainDatabase, type ReadView } from '@/vault/eav/index.ts';

export const Event = e.entity('calendar.event', {
  title: e.string(),
  description: e.string(),
  status: e.enum('planned', 'occurred', 'cancelled', 'unknown'),
  time: e.json(),
  reportedTime: e.json().optional(),
  available: e.boolean(),
});

/** Validated exact subject identities, without a duplicate Calendar-owned Subject. */
export const EventRole = e.entity('calendar.eventRole', {
  event: e.ref(Event),
  subject: e.historicalRef(),
  kind: e.enum('participant', 'place'),
  role: e.string(),
  order: e.number(),
});

/** Supporting material is retained without declaring it reviewed or corroborated. */
export const EventSource = e.entity('calendar.eventSource', {
  event: e.ref(Event),
  source: e.historicalRef(),
});

/** An annual date is a recurrence, not a particular occurrence or a guessed birth year. */
export const AnnualDate = e.entity('calendar.annualDate', {
  title: e.string(),
  month: e.number(),
  day: e.number(),
  subject: e.historicalRef().optional(),
  expression: e.string().optional(),
  available: e.boolean(),
});

export const calendarEntities = {
  calendarEvents: Event,
  calendarEventRoles: EventRole,
  calendarEventSources: EventSource,
  calendarAnnualDates: AnnualDate,
} as const;
export const calendarSchema = e.registry(calendarEntities);
export type CalendarDatabase = DomainDatabase<typeof calendarEntities>;
export type CalendarReading = ReadView<typeof calendarEntities>;
export type EventRef = EntityRef<typeof Event>;
export type AnnualDateRef = EntityRef<typeof AnnualDate>;
