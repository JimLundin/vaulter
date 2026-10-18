import { useEffect, useState } from 'react';
import { readCalendar } from './reading.ts';
import type { CalendarDatabase } from './records.ts';
import type { CalendarData } from './presentation.ts';

export interface CalendarInput {
  database: () => Promise<CalendarDatabase>;
}

export function useCalendar(input: CalendarInput | null) {
  const [state, setState] = useState<{
    owner: CalendarInput | null;
    data?: CalendarData;
    error?: string;
  }>({ owner: input });
  useEffect(() => {
    let active = true;
    let close: () => void = () => undefined;
    let revision = 0;
    if (input)
      input
        .database()
        .then((db) => {
          const load = () => {
            const request = ++revision;
            readCalendar(db)
              .then((data) => {
                if (active && revision === request) setState({ owner: input, data });
              })
              .catch((error: unknown) => {
                if (active && revision === request)
                  setState({
                    owner: input,
                    error: error instanceof Error ? error.message : String(error),
                  });
              });
          };
          if (!active) return;
          close = db.subscribe(load);
          load();
        })
        .catch((error: unknown) => {
          if (active)
            setState({
              owner: input,
              error: error instanceof Error ? error.message : String(error),
            });
        });
    return () => {
      active = false;
      close();
    };
  }, [input]);
  return state.owner === input ? state : { owner: input };
}
