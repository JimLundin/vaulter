import type { NodeBackend } from './store.ts';
import type { NodeRecord } from './validation.ts';
import { parseCommit } from './validation.ts';
import { accept } from './history.ts';
import { digest } from './json.ts';
import { nodeInterface, notifications } from './backend.ts';
import { serial } from '../storage/coordination.ts';

/** Volatile adapter for previews and the same acceptance rules used by GitHub. */
export function memoryNodeBackend(): NodeBackend {
  let records: readonly NodeRecord[] = Object.freeze([]);
  const run = serial();
  const events = notifications();
  let closed = false;
  const checkOpen = () => {
    if (closed) throw new Error('Node store is closed');
  };
  return nodeInterface({
    read: () => records,
    append: (request) =>
      run(async () => {
        checkOpen();
        const value = parseCommit(request);
        const requestDigest = await digest(value);
        checkOpen();
        const record = accept(records, value, requestDigest, new Date().toISOString());
        if (!records.includes(record)) {
          records = Object.freeze([...records, record]);
          events.notify();
        }
        return record;
      }),
    cached: async () => undefined,
    refresh: async () => undefined,
    clear: () =>
      run(() => {
        checkOpen();
        records = Object.freeze([]);
        events.notify();
        return Promise.resolve();
      }),
    close: () => {
      closed = true;
      events.close();
    },
    subscribe: events.subscribe,
  });
}
