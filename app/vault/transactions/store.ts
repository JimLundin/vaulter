import type { NodeCommit, NodePublicationRule, NodeReading } from '@/vault/nodes/store.ts';
import type { Transaction, TransactionId } from '@/vault/nodes/model.ts';

export interface WriterContext {
  readonly recordedBy: string;
  readonly origin: string | null;
  /** Trusted owner admission, consulted again immediately before entering persistence. */
  readonly admission?: () => void;
  readonly publication?: NodePublicationRule;
}

export type TransactionDraft = Omit<NodeCommit, 'id' | 'recordedBy' | 'origin'>;

export interface CalculationContext {
  readonly id: TransactionId;
  readonly recordedBy: string;
  readonly origin: string | null;
  /** Captured adapter generation; replacement invalidates unfinished calculation. */
  readonly nodes: NodeReading;
  readonly signal: AbortSignal;
}

export interface Calculated<V> {
  readonly value: V;
  readonly transaction: TransactionDraft;
}
export type Calculation<V> = (
  context: CalculationContext,
) => Calculated<V> | Promise<Calculated<V>>;

export interface Receipt<V> {
  readonly value: V;
  readonly transaction: Transaction;
}

export interface RequestState {
  readonly phase:
    | 'calculating'
    | 'prepared'
    | 'publishing'
    | 'accepted'
    | 'blocked'
    | 'rejected'
    | 'uncertain';
  readonly finalized: boolean;
  readonly attempts: number;
  readonly error?: unknown;
  readonly transaction?: Transaction;
}

export interface TransactionRequest<V> {
  readonly id: TransactionId;
  readonly ready: Promise<V>;
  /** Permanently the initial attempt. Recovery is returned by lifetime.retry instead. */
  readonly result: Promise<Receipt<V>>;
  readonly snapshot: () => RequestState;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface PreparedRequest<V> extends TransactionRequest<V> {
  /** Starts at most one initial attempt, using the lifetime that prepared this request. */
  readonly accept: () => Promise<Receipt<V>>;
}

export interface WriteLifetime extends Disposable, AsyncDisposable {
  readonly write: <V>(calculate: Calculation<V>) => TransactionRequest<V>;
  readonly prepare: <V>(calculate: Calculation<V>) => PreparedRequest<V>;
  readonly retry: <V>(request: TransactionRequest<V>) => Promise<Receipt<V>>;
  readonly close: (reason?: unknown) => void;
}

export interface ScopedTransactionWriter {
  readonly lifetime: (options?: { readonly signal?: AbortSignal }) => WriteLifetime;
}

/**
 * An actual reading facade with no raw commit property. Session replaces the facade when its
 * adapter changes; previously borrowed facades still direct new calls to the current adapter.
 */
export interface TransactionStore extends NodeReading {
  /** Stable for append ordering and feature ownership through adapter replacement. */
  readonly identity: object;
  readonly writer: (context: WriterContext) => ScopedTransactionWriter;
}
