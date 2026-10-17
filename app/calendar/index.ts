// biome-ignore-all lint/performance/noBarrelFile: Calendar exposes one public data interface.
export { calendarEntities, calendarSchema } from './schema.ts';
export type { CalendarDatabase, CalendarReading, EventRef, AnnualDateRef } from './schema.ts';
export {
  createEvent,
  reviseEvent,
  removeEvent,
  createAnnualDate,
  reviseAnnualDate,
} from './operations.ts';
export type { EventInput } from './operations.ts';
export { readCalendar, readTimeline } from './reading.ts';
export type { CalendarWindow } from './reading.ts';
export { parseTime } from './time.ts';
export type { TimeValue, TimePoint } from './time.ts';
export { CalendarPage, type CalendarActions } from './CalendarPage.tsx';
export { CalendarTimeline } from './CalendarTimeline.tsx';
export { useCalendar, type CalendarInput } from './use-calendar.ts';
export { calendarEntries, type CalendarData, type CalendarEntry } from './presentation.ts';
export { calendarRoute } from './routes.ts';
