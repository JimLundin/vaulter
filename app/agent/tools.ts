import type { ToolSet } from 'ai';
import type { NodeCommit, NodeSnapshot, NodeDifference } from '../vault/nodes/store.ts';

/** Trusted execution context; never part of model arguments. */
export interface AgentToolContext {
  readonly signal: AbortSignal;
  /** Trusted publication attribution supplied by Agent, never by tool arguments. */
  readonly author?: {
    readonly recordedBy: string;
    readonly origin: string;
  };
  readonly snapshot: () => NodeSnapshot;
  readonly commit: (
    request: Omit<NodeCommit, 'recordedBy' | 'origin' | 'undoOf'>,
  ) => Promise<string>;
}
export type AgentToolFactory = (context: AgentToolContext) => ToolSet | Promise<ToolSet>;
/** Caller composes the policy owned by its producer (for example Chat transcript protection). */
export type ContentWritePolicy = (difference: NodeDifference) => boolean;
