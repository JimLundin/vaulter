// PROTOTYPE: examples of feature-owned operation registration, outside the backing model.
import type { TransactionKind } from '../operations.ts';

declare module '../operations.ts' {
  interface TransactionActions {
    readonly demo: 'seed' | 'cite';
    readonly actor: 'update' | 'delete';
    readonly calendarImport: 'apply';
  }
}

export const spikeOperations = {
  seed: { scope: 'demo', action: 'seed' },
  cite: { scope: 'demo', action: 'cite' },
  updateActor: { scope: 'actor', action: 'update' },
  deleteActor: { scope: 'actor', action: 'delete' },
  applyCalendarImport: { scope: 'calendarImport', action: 'apply' },
} as const satisfies Readonly<Record<string, TransactionKind>>;
