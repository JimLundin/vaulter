import type { ToolSet } from 'ai';
import type { NodeSnapshot, NodeDifference } from '@/vault/nodes/store.ts';
import type { TransactionDraft } from '@/vault/transactions/store.ts';

export type ToolChanges = Omit<TransactionDraft, 'undoOf'>;
export type ToolCalculation = (id: string) => ToolChanges | Promise<ToolChanges>;

/** Trusted execution context; never part of model arguments. */
export interface AgentToolContext {
  readonly signal: AbortSignal;
  /** Trusted publication attribution supplied by Agent, never by tool arguments. */
  readonly author?: {
    readonly recordedBy: string;
    readonly origin: string;
  };
  readonly snapshot: () => NodeSnapshot;
  /** The core supplies identity before the tool constructs changes or exact references. */
  readonly write: (calculate: ToolCalculation) => Promise<string>;
}
export type AgentToolFactory = (context: AgentToolContext) => ToolSet | Promise<ToolSet>;
/** Caller composes the policy owned by its producer (for example Chat transcript protection). */
export type ContentWritePolicy = (difference: NodeDifference) => boolean;
