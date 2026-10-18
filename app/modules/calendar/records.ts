import { e, type EntityRef, type DomainDatabase, type ReadView } from '@/core/store/index.ts';

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

/** Ordered temporal context; a date bucket is not an assertion that an Event occurred. */
export const Chronology = e.entity('calendar.chronology', {
  kind: e.enum('collection', 'date-context'),
  label: e.string().optional(),
  time: e.json().optional(),
  recurrence: e.enum('yearly').optional(),
  context: e.retainedStateRef().optional(),
  provenance: e.retainedStateRef().optional(),
  available: e.boolean(),
});

/** Exact recorded endpoints can include deleted records; order preserves source placement. */
export const ChronologyItem = e.entity('calendar.chronologyItem', {
  chronology: e.ref(Chronology),
  target: e.retainedStateRef(),
  order: e.string(),
  provenance: e.retainedStateRef().optional(),
  available: e.boolean(),
});

/** Cross-owner temporal containment; a parent deletion does not remove its descendants. */
export const ChronologyPlacement = e.entity('calendar.chronologyPlacement', {
  parent: e.retainedStateRef(),
  child: e.retainedStateRef(),
  order: e.string(),
  provenance: e.retainedStateRef().optional(),
  available: e.boolean(),
});

export const calendarEntities = {
  calendarChronologyPlacements: ChronologyPlacement,
  calendarChronologies: Chronology,
  calendarChronologyItems: ChronologyItem,
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

export type ChronologyRef = EntityRef<typeof Chronology>;
export type ChronologyItemRef = EntityRef<typeof ChronologyItem>;

export type ChronologyPlacementRef = EntityRef<typeof ChronologyPlacement>;
