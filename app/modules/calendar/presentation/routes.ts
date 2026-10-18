import { definePage } from '@/core/navigation/index.ts';
import { CalendarPage } from './CalendarPage.tsx';
import { calendarRoute } from '@/modules/calendar/routes.ts';
export const calendarPage = definePage({
  patterns: [calendarRoute],
  component: CalendarPage,
  destination: { label: 'Calendar', href: calendarRoute.href(), icon: 'calendar' },
  command: { id: 'go.calendar', keys: 'g c' },
});
