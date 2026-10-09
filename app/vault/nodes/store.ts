// Proposed application contract; memory and IndexedDB implementations are the next step.
import type { NodeId, NodeVersion, Transaction, TransactionId } from './model.ts';

/** A complete proposed state plus the version expected at acceptance time. */
export interface NodeChange extends Omit<NodeVersion, 'transactionId'> {
  /** Null expects a new identity; deletion and restoration expect the last recorded version. */
  readonly expectedTransactionId: TransactionId | null;
}

/** Write request, not another persisted transaction definition. The store assigns order and time. */
export interface NodeCommit extends Omit<Transaction, 'sequence' | 'recordedAt'> {
  /** Reuse id on retry. Attribution comes from the trusted writer context, not agent tool input. */
  readonly changes: readonly NodeChange[];
  /** Additional node states on which the calculation depended. */
  readonly expectedReads?: Readonly<Record<NodeId, TransactionId | null>>;
}

/** Immutable projection; target lookups use this same snapshot. */
export interface NodeSnapshot {
  readonly sequence: number;
  /** Undefined before creation; a version with data: null records deletion. */
  readonly get: (nodeId: NodeId) => NodeVersion | undefined;
  /** Live children only, ordered by orderKey then nodeId; empty for absent/deleted parents. */
  readonly children: (parentNodeId: NodeId) => readonly NodeVersion[];
}

export interface NodeDifference {
  readonly nodeId: NodeId;
  readonly before: NodeVersion | null;
  readonly after: NodeVersion;
}

/** Domain operations; UI and tools use this interface rather than database tables. */
export interface NodeStore {
  /** Validate and atomically publish complete versions, preserving previous states. */
  readonly commit: (request: NodeCommit) => Promise<Transaction>;
  readonly snapshot: (sequence?: number) => Promise<NodeSnapshot>;
  readonly history: (options?: {
    readonly beforeSequence?: number;
    readonly limit?: number;
    readonly kinds?: readonly Transaction['kind'][];
  }) => Promise<readonly Transaction[]>;
  readonly changes: (transactionId: TransactionId) => Promise<readonly NodeDifference[]>;
  /** Notification after acceptance; subscribers reread projections. */
  readonly subscribe: (listener: () => void) => () => void;
}
