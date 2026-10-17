import { expect, test } from 'vitest';
import { recordsReady, writeAvailability } from './availability.ts';
import type { Status } from './session.ts';

test.each<{ status: Status; ready: boolean; unavailable?: string }>([
  { status: { kind: 'loading' }, ready: false, unavailable: 'Opening the vault…' },
  { status: { kind: 'syncing' }, ready: false, unavailable: 'Opening the vault…' },
  { status: { kind: 'offline' }, ready: true, unavailable: 'Connect to save changes.' },
  {
    status: { kind: 'error', message: 'Refresh failed' },
    ready: true,
    unavailable: 'Vault error: Refresh failed',
  },
  { status: { kind: 'synced', at: 0 }, ready: true },
])(
  'Session separates retained record readiness from write admission: $status.kind',
  ({ status, ready, unavailable }) => {
    expect(recordsReady(status)).toBe(ready);
    expect(writeAvailability(status, true)).toBe(unavailable);
    expect(writeAvailability(status, false)).toBe('Opening the vault…');
  },
);
