// biome-ignore-all lint/performance/noBarrelFile: Calendar exposes one public data interface.
export { calendarEntities, calendarSchema } from './records.ts';
export type { CalendarDatabase, CalendarReading, EventRef, AnnualDateRef } from './records.ts';
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
export { calendarEntries, type CalendarData, type CalendarEntry } from './view.ts';
export { calendarRoute } from './routes.ts';
export type { CalendarActions } from './presentation/CalendarPage.tsx';
