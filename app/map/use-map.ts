import { useEffect, useState } from 'react';
import type { MapData } from './presentation.ts';
export interface MapInput {
  read: () => Promise<MapData>;
  subscribe: (listener: () => void) => () => void;
}
export function useMap(input: MapInput | null) {
  const [state, setState] = useState<{ owner: MapInput | null; data?: MapData; error?: string }>({
    owner: input,
  });
  useEffect(() => {
    if (!input) return;
    let active = true;
    let revision = 0;
    const load = () => {
      const request = ++revision;
      input
        .read()
        .then((data) => {
          if (active && request === revision) setState({ owner: input, data });
        })
        .catch((error: unknown) => {
          if (active && request === revision)
            setState({
              owner: input,
              error: error instanceof Error ? error.message : String(error),
            });
        });
    };
    const close = input.subscribe(load);
    load();
    return () => {
      active = false;
      close();
    };
  }, [input]);
  return state.owner === input ? state : { owner: input };
}
