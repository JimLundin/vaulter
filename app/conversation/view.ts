// Chat presentation snapshots shared by its controller and views.
import type { ToolEvidenceState } from '@/agent/index.ts';
export type Part =
  | { kind: 'text'; text: string }
  | (ToolEvidenceState & { kind: 'tool'; callId?: string });
export interface Turn {
  role: 'user' | 'agent' | 'record';
  record?: { kind: 'summary'; label?: string };
  parts: Part[];
  error?: string;
  status?: 'unknown';
  /** When it started, for the raw record; and, for the agent's, what it cost and who answered. */
  at: string;
  tokens?: { in: number; out: number };
  model?: string;
}

/** What views render: replaced on every change, so it's its own snapshot. */
export interface ChatState {
  /** Typed or dictated text awaiting submission, shared by every view of this chat. */
  draft: string;
  turns: Turn[];
  suggestions: string[];
  busy: boolean;
  /** A reply finished while no view was open. */
  unread: boolean;
}
