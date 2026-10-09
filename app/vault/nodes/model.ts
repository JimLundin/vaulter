/** Stable identities; their encoding is chosen independently of storage. */
export type NodeId = string;
export type TransactionId = string;

/** Nested JSON content. Structural references use the fields on NodeVersion. */
export type JsonValue = string | number | boolean | null | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Identity persists through edits, moves, deletion, and restoration. */
export interface Node {
  readonly id: NodeId;
}

/** An immutable group of changes published atomically within one vault. */
export interface Transaction {
  readonly id: TransactionId;
  /** Unique, monotonically increasing order of committed transactions. */
  readonly sequence: number;
  /** ISO timestamp; sequence, rather than this timestamp, orders history. */
  readonly recordedAt: string;
}

/**
 * Complete state of one node, with composite primary key (nodeId, transactionId).
 * Each transaction records at most one version per node. Earlier versions remain immutable.
 */
export interface NodeVersion {
  /** Foreign key to Node.id: the identity whose state is recorded. */
  readonly nodeId: NodeId;
  /** Foreign key to Transaction.id: the transaction recording this state. */
  readonly transactionId: TransactionId;
  /** Foreign key to Node.id: placement is owned by the child. Null means unplaced. */
  readonly parentNodeId: NodeId | null;
  /** Foreign key to Node.id: a reference to another identity, resolved in the same snapshot. */
  readonly targetNodeId: NodeId | null;
  /** Sortable placement key, compared lexicographically; null when unplaced. */
  readonly orderKey: string | null;
  /** Complete nested JSON content. Null records deletion, preserving identity and history. */
  readonly data: JsonObject | null;
}
