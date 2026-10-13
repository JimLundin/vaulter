import { expect, test } from 'vitest';
import { nodeRecordsReady, nodeWriteAvailability } from './availability.ts';
import type { Status } from './session.ts';

test.each<{ status: Status; ready: boolean; unavailable?: string }>([
  { status: { kind: 'loading' }, ready: false, unavailable: 'Opening the node store…' },
  { status: { kind: 'syncing' }, ready: false, unavailable: 'Opening the node store…' },
  { status: { kind: 'offline' }, ready: true, unavailable: 'Connect to save changes.' },
  {
    status: { kind: 'error', message: 'Refresh failed' },
    ready: true,
    unavailable: 'Node store error: Refresh failed',
  },
  { status: { kind: 'synced', at: 0 }, ready: true },
])(
  'Session separates retained record readiness from write admission: $status.kind',
  ({ status, ready, unavailable }) => {
    expect(nodeRecordsReady(status)).toBe(ready);
    expect(nodeWriteAvailability(status, true)).toBe(unavailable);
    expect(nodeWriteAvailability(status, false)).toBe('Opening the node store…');
  },
);
