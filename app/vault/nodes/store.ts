// Application contract exercised by nodes/spike; production integration is still pending.
import type { JsonObject, NodeId, NodeVersion, Transaction, TransactionId } from './model.ts';

/** A complete proposed state plus the version expected at acceptance time. */
export interface NodeChange extends Omit<NodeVersion, 'transaction'> {
  /** Null expects a new identity; deletion and restoration expect the last recorded version. */
  readonly expected: TransactionId | null;
}

/** Write request, not another persisted transaction definition. The store assigns order and time. */
export interface NodeCommit<Metadata extends JsonObject = JsonObject>
  extends Omit<Transaction<Metadata>, 'sequence' | 'recordedAt'> {
  /** Reuse id on retry. Attribution comes from the trusted writer context, not agent tool input. */
  readonly changes: readonly NodeChange[];
  /** Additional node states on which the calculation depended. */
  readonly expectedReads?: Readonly<Record<NodeId, TransactionId | null>>;
}

/** Immutable projection; target lookups use this same snapshot. */
export interface NodeSnapshot {
  readonly sequence: number;
  /** Undefined before creation; a version with data: null records deletion. */
  readonly get: (node: NodeId) => NodeVersion | undefined;
  /** Live children only, ordered by order then node; empty for absent/deleted parents. */
  readonly children: (parent: NodeId) => readonly NodeVersion[];
}

export interface NodeDifference {
  readonly node: NodeId;
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
  readonly changes: (transaction: TransactionId) => Promise<readonly NodeDifference[]>;
  /** Notification after acceptance; subscribers reread projections. */
  readonly subscribe: (listener: () => void) => () => void;
}
