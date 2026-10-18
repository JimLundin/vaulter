import { useEffect, useState } from 'react';
import { readTasks } from '@/modules/tasks/reading.ts';
import type { TaskDatabase } from '@/modules/tasks/records.ts';
import type { TaskData } from '@/modules/tasks/reading.ts';

export interface TasksInput {
  database: () => Promise<TaskDatabase>;
}

export function useTasks(input: TasksInput | null) {
  const [state, setState] = useState<{
    owner: TasksInput | null;
    data?: TaskData;
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
            readTasks(db)
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
