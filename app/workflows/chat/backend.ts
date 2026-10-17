import type { AgentRunData } from '@/agent/records.ts';
import type { AgentBackendOptions, AgentRunState } from '@/agent/runtime.ts';
import type { JsonObject } from '@/vault/eav/index.ts';
import type { CheckpointTask } from './checkpoint-task.ts';
import type { TimelineEntry } from './data/timeline.ts';
import type { MessageData } from './message.ts';
export interface ChatRequest {
  readonly id: string;
  readonly conversation: string;
  readonly text: string;
  readonly model: string;
}
export interface ChatOptions extends AgentBackendOptions {
  readonly user: string;
  readonly agent: string;
  readonly provider: string;
  readonly instructions: string;
  readonly settings?: JsonObject;
  readonly enabledTools?: AgentRunData['enabledTools'];
}
/** Conversation meaning supplied by the effect owner, without exposing its pending commits. */
export interface ChatRecoveryAction {
  readonly error: string;
  readonly label: string;
  readonly inProgress: boolean;
  readonly allowed: boolean;
}
export interface ChatRecovery {
  readonly save?: ChatRecoveryAction & {
    readonly stage: NonNullable<ChatRunState['persistenceStage']>;
  };
  readonly content?: ChatRecoveryAction;
  readonly refresh?: ChatRecoveryAction;
}
export interface ChatRunState {
  readonly phase: AgentRunState['phase'] | 'queued';
  readonly response: Extract<MessageData, { role: 'agent' }>;
  readonly execution?: AgentRunState;
  readonly recovery?: ChatRecovery;
  readonly persistenceError?: string;
  readonly persistenceStage?: AgentRunState['persistenceStage'] | 'response';
  readonly contentPersistence?: AgentRunState['contentPersistence'];
  readonly contentAccepted?: string;
  readonly contextError?: string;
}
export interface ChatRun {
  readonly snapshot: () => ChatRunState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly done: Promise<ChatRunState>;
  readonly stop: () => void;
  readonly retrySave: () => Promise<ChatRunState>;
  readonly retryContentSave: () => Promise<ChatRunState>;
  readonly refreshContext: () => Promise<ChatRunState>;
  readonly prepared: () => unknown;
}

export interface SavedChat {
  readonly node: string;
  readonly data: { readonly title: string };
  readonly activeAt: string;
}
export const CONVERSATION_PAGE_SIZE = 20;
export interface ChatBackend {
  readonly continuous?: boolean;
  timeline?: () => Promise<readonly TimelineEntry[]>;
  checkpoint?: (model: string) => CheckpointTask;
  send: (request: ChatRequest) => ChatRun;
  chats: (query?: { readonly limit?: number }) => Promise<readonly SavedChat[]>;
  messages: (conversation: string) => Promise<readonly { readonly data: MessageData }[]>;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}
export type ChatBackendFactory = (options: ChatOptions) => ChatBackend;
