import type { ToolSet } from 'ai';
import type { EntityRef } from '@/application/store/index.ts';
import type { Actor } from '@/actors/index.ts';
import type { AgentRunRef } from './records.ts';

/** Trusted attribution supplied by Agent, separate from model arguments. */
export interface AgentToolContext {
  readonly signal: AbortSignal;
  /** Absent while inspecting declarations before an accepted run. */
  readonly author?: EntityRef<typeof Actor>;
  readonly run?: AgentRunRef;
}
export type AgentToolFactory = (context: AgentToolContext) => ToolSet | Promise<ToolSet>;
