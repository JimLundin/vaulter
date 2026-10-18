import type { Status } from './session.ts';

/** Session owns whether its EAV storage can accept an explicit write. */
export function writeAvailability(status: Status, hasStorage: boolean): string | undefined {
  if (!hasStorage) return 'Opening the vault…';
  if (status.kind === 'error') return `Vault error: ${status.message}`;
  if (status.kind === 'offline') return 'Connect to save changes.';
  if (status.kind !== 'synced') return 'Opening the vault…';
}

export const recordsReady = (status: Status) =>
  status.kind !== 'loading' && status.kind !== 'syncing';
