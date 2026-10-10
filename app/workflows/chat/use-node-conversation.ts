import { useEffect, useRef, useSyncExternalStore } from 'react';
import { later } from '../../ui/later.ts';
import {
  createNodeConversation,
  type NodeConversationOptions,
  type NodeConversation,
} from './node-conversation.ts';

export const useNodeChat = (conversation: NodeConversation) =>
  useSyncExternalStore(conversation.subscribe, conversation.snapshot);
export function useNodeConversation(options: NodeConversationOptions) {
  const ref = useRef<NodeConversation | null>(null);
  ref.current ??= createNodeConversation(options);
  const conversation = ref.current;
  conversation.updateOptions(options);
  useEffect(() => {
    if (options.availability) return;
    // Without a retained selection, continue the vault's most recently active conversation.
    later(
      (options.conversation
        ? conversation.open(options.conversation)
        : conversation.openLatest()
      ).catch(() => {
        /* No accepted conversation yet. */
      }),
    );
  }, [conversation, options.conversation, options.availability]);
  useEffect(() => () => conversation.dispose(), [conversation]);
  return conversation;
}
