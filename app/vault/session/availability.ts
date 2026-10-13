import type { Status } from './session.ts';

/** Session owns whether its node adapter can accept an explicit write. */
export function nodeWriteAvailability(status: Status, hasNodes: boolean): string | undefined {
  if (!hasNodes) return 'Opening the node store…';
  if (status.kind === 'error') return `Node store error: ${status.message}`;
  if (status.kind === 'offline') return 'Connect to save changes.';
  if (status.kind !== 'synced') return 'Opening the node store…';
}

export const nodeRecordsReady = (status: Status) =>
  status.kind !== 'loading' && status.kind !== 'syncing';
