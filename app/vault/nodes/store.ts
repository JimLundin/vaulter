// Application interface shared by memory and GitHub persistence.
import type {
  JsonObject,
  NodeAddress,
  NodeId,
  NodeVersion,
  Transaction,
  TransactionId,
} from './model.ts';

/** A complete proposed state plus the version expected at acceptance time. */
export interface NodeChange extends Omit<NodeVersion, 'key'> {
  /** Proposed identity; the writer constructs its exact key using the commit's transaction. */
  readonly node: NodeId;
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

/** Immutable projection: identity addresses inherit this snapshot; exact addresses select a row. */
export interface NodeSnapshot {
  readonly sequence: number;
  /** Undefined before creation; a version with data: null records deletion. */
  readonly get: (node: NodeId) => NodeVersion | undefined;
  /** Exact references never fall back to the latest version or interpret transaction as a cutoff. */
  readonly resolve: (address: NodeAddress) => NodeVersion | undefined;
  /** Live child placements at this cutoff; parent may select an identity or exact live version. */
  readonly children: (parent: NodeId | NodeAddress) => readonly NodeVersion[];
  /** Live unplaced nodes at this cutoff: the roots of the vault's containment trees. */
  readonly roots: () => readonly NodeVersion[];
}

/** Ephemeral live-publication policy; accepted history is not reinterpreted through this rule. */
export interface NodePublicationContext {
  readonly request: NodeCommit;
  /** Authoritative accepted state, including backend refresh and any preceding writer. */
  readonly before: NodeSnapshot;
  /** Complete proposed state, including exact addresses created by this transaction. */
  readonly after: NodeSnapshot;
  /** Accepted versions in recording order, retaining identities through deletion and retagging. */
  readonly versions: (node: NodeId) => readonly NodeVersion[];
}

/** Throw to reject the complete new transaction before physical publication. */
export type NodePublicationRule = (context: NodePublicationContext) => void;

export interface NodeDifference {
  readonly node: NodeId;
  readonly before: NodeVersion | null;
  readonly after: NodeVersion;
}

/** Domain operations; UI and tools use this interface rather than database tables. */
export interface NodeReading {
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

/** Persistence and fixture interface. Application writers use TransactionStore lifetimes. */
export interface NodeStore extends NodeReading {
  readonly commit: (request: NodeCommit, publication?: NodePublicationRule) => Promise<Transaction>;
}

/** Session-owned adapter lifecycle; workflows receive only managed reading and writing. */
export interface NodeBackend extends NodeStore {
  /** Load the device cache without contacting the remote. */
  readonly cached: () => Promise<void>;
  /** Synchronize authoritative history; commit always refreshes before acceptance. */
  readonly refresh: () => Promise<void>;
  /** Delete this adapter's device cache, retaining remote history. */
  readonly clear: () => Promise<void>;
  /** Release subscriptions and reject further operations. */
  readonly close: () => void;
}
