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
export { CalendarPage, type CalendarActions } from './presentation/CalendarPage.tsx';
export { CalendarTimeline } from './presentation/CalendarTimeline.tsx';
export { useCalendar, type CalendarInput } from './use-calendar.ts';
export { calendarEntries, type CalendarData, type CalendarEntry } from './presentation.ts';
export { calendarRoute } from './routes.ts';
