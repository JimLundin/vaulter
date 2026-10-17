import type { NodeChatRun, NodeChatOptions, NodeChatRequest } from './node-backend.ts';
import type { SavedChat, SavedMessage } from './records/chat-store.ts';

/** Retained interaction depends on chat behavior, independently of its record storage. */
export type ChatRun = Omit<NodeChatRun, 'prepared'> & { readonly prepared: () => unknown };
export interface ChatBackend {
  readonly continuous?: boolean;
  send: (request: NodeChatRequest) => ChatRun;
  chats: (query?: { readonly limit?: number }) => Promise<readonly SavedChat[]>;
  messages: (conversation: string) => Promise<readonly Pick<SavedMessage, 'data'>[]>;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}
export type ChatBackendFactory = (options: NodeChatOptions) => ChatBackend;
