import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
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
  // Publish changed owner availability after render and before any browser action can run.
  useLayoutEffect(() => {
    conversation.updateOptions(options);
  }, [conversation, options]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: store synchronization must retry history restoration, while model availability never gates reads.
  useEffect(() => {
    // Reading accepted history does not require a configured model or permission to send.
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
