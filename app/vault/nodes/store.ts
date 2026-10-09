// Proposed application contract; memory and IndexedDB implementations are the next step.
import type { NodeId, NodeVersion, Transaction, TransactionId } from './model.ts';

/** History metadata supplements the backing transaction's identity and order. */
export interface RecordedTransaction extends Transaction {
  readonly message: string;
  readonly kind: 'chat' | 'content' | 'undo';
  readonly originNodeId: NodeId | null;
  readonly undoOfTransactionId: TransactionId | null;
}

/** A complete proposed state plus the version expected at acceptance time. */
export interface NodeChange extends Omit<NodeVersion, 'transactionId'> {
  /** Null expects a new identity; deletion and restoration expect the last recorded version. */
  readonly expectedTransactionId: TransactionId | null;
}

export interface NodeCommit {
  /** Reuse this ID on retry; an accepted identical request returns its original transaction. */
  readonly id: TransactionId;
  readonly message: string;
  readonly kind: RecordedTransaction['kind'];
  readonly originNodeId: NodeId | null;
  readonly undoOfTransactionId: TransactionId | null;
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
  readonly commit: (request: NodeCommit) => Promise<RecordedTransaction>;
  readonly snapshot: (sequence?: number) => Promise<NodeSnapshot>;
  readonly history: (options?: {
    readonly beforeSequence?: number;
    readonly limit?: number;
    readonly kind?: RecordedTransaction['kind'];
  }) => Promise<readonly RecordedTransaction[]>;
  readonly changes: (transactionId: TransactionId) => Promise<readonly NodeDifference[]>;
  /** Notification after acceptance; subscribers reread projections. */
  readonly subscribe: (listener: () => void) => () => void;
}
