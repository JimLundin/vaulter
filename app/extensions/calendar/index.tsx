// The calendar: every `dates` entry (#/calendar/), and a note's own dates under it.
import { CalendarDaysIcon } from 'lucide-react';
import type { Extension } from '../../core/extension.ts';
import { Calendar, NoteDates } from './Calendar.tsx';
import { noteSections } from '../reader/slots.tsx';
import { calendarPage } from './routes.ts';

export const calendar: Extension = {
  id: 'calendar',
  page: (path) => (calendarPage.match(path) ? { title: 'Calendar', body: <Calendar /> } : null),
  nav: [
    {
      label: 'Calendar',
      href: calendarPage.href(),
      icon: CalendarDaysIcon,
      keys: 'g c',
      tab: true,
      order: 10,
      summary: 'Every dated entry across the vault',
    },
  ],
  contributes: [noteSections.add({ order: 50, view: NoteDates })],
};
