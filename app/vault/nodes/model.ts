import type { TransactionKind } from './operations.ts';

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
export interface Transaction<Metadata extends JsonObject = JsonObject> {
  readonly id: TransactionId;
  /** Unique, monotonically increasing order of committed transactions. */
  readonly sequence: number;
  /** ISO timestamp; sequence, rather than this timestamp, orders history. */
  readonly recordedAt: string;
  /** Foreign key to the user, agent, or system Node that authored the change. Required. */
  readonly recordedBy: NodeId;
  /** Specific operation name. The storage model accepts new kinds without a schema change. */
  readonly kind: TransactionKind;
  /** Optional human-readable description; never used to determine operation semantics. */
  readonly message: string | null;
  /** Foreign key to the context Node that produced this change; null for direct actions. */
  readonly origin: NodeId | null;
  /** Foreign key to the Transaction compensated by this operation, if any. */
  readonly undoOf: TransactionId | null;
  /** Optional typed JSON payload. References requiring integrity checks belong in explicit fields. */
  readonly metadata?: Metadata;
}

/**
 * Complete state of one node, with composite primary key (node, transaction).
 * Each transaction records at most one version per node. Earlier versions remain immutable.
 */
export interface NodeVersion<Data extends JsonObject = JsonObject> {
  /** Foreign key to Node.id: the identity whose state is recorded. */
  readonly node: NodeId;
  /** Foreign key to Transaction.id: the transaction recording this state. */
  readonly transaction: TransactionId;
  /** Foreign key to Node.id: placement is owned by the child. Null means unplaced. */
  readonly parent: NodeId | null;
  /** Foreign key to Node.id: a reference to another identity, resolved in the same snapshot. */
  readonly target: NodeId | null;
  /** Sortable placement key, compared lexicographically; null when unplaced. */
  readonly order: string | null;
  /** Complete nested JSON content. Null records deletion, preserving identity and history. */
  readonly data: Data | null;
}
