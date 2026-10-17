// Live execution state is a projection of canonical EAV Agent records.
import type { AgentExecutionProvider, LanguageModelProvider } from './providers.ts';
import type { AgentRunData, ToolExecutionData } from './records.ts';
import type { AgentToolFactory } from './tools.ts';
export interface PendingToolSave {
  readonly id: string;
  readonly node: string;
  readonly retryable: boolean;
  readonly execution: ToolExecutionData;
  readonly stage: 'invocation' | 'outcome';
}
export interface AgentRunState {
  readonly phase:
    | 'accepting'
    | 'running'
    | 'saving'
    | 'complete'
    | 'stopped'
    | 'failed'
    | 'interrupted'
    | 'unsaved'
    | 'recorded'
    | 'paused';
  /** Shared owner progress; pending records and receipts remain private to the run. */
  readonly recoveryActivity?: {
    readonly save: boolean;
    readonly content: boolean;
    readonly refresh: boolean;
  };
  readonly data: AgentRunData;
  readonly text: string;
  readonly persistenceError?: string;
  readonly persistenceStage?: 'initial' | 'invocation' | 'content' | 'outcome' | 'terminal';
  readonly tools?: readonly { readonly node: string; readonly data: ToolExecutionData }[];
  readonly pendingTool?: PendingToolSave;
  readonly contextError?: string;
  readonly contentPersistence?: { readonly id: string; readonly error: string };
  readonly contentAccepted?: string;
}
export interface AgentRun {
  readonly snapshot: () => AgentRunState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly done: Promise<AgentRunState>;
  readonly stop: () => void;
  /** Saves exact pending work; may release this same live run, never replay a completed effect. */
  readonly retrySave: () => Promise<AgentRunState>;
  readonly retryContentSave: () => Promise<AgentRunState>;
  readonly refreshContext: () => Promise<AgentRunState>;
}
export interface AgentBackendOptions {
  readonly model?: LanguageModelProvider;
  readonly execution?: AgentExecutionProvider;
  readonly tools?: AgentToolFactory;
}
