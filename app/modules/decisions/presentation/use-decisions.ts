import { useEffect, useState } from 'react';
import { readDecisions } from '@/modules/decisions/reading.ts';
import type { DecisionDatabase } from '@/modules/decisions/records.ts';
import type { DecisionData } from '@/modules/decisions/reading.ts';

export interface DecisionsInput {
  database: () => Promise<DecisionDatabase>;
}

export function useDecisions(input: DecisionsInput | null) {
  const [state, setState] = useState<{
    owner: DecisionsInput | null;
    data?: DecisionData;
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
            readDecisions(db)
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
