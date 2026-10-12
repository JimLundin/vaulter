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
  const requestedRoute = useRef<{ node: string; availability?: string } | undefined>(undefined);
  const startup = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: capability readiness can retry startup reads; execution permission never gates them.
  useEffect(() => {
    const restoring = startup.current;
    startup.current = false;
    const requested = options.conversation;
    if (requested) {
      const previous = requestedRoute.current;
      if (
        previous?.node === requested &&
        (!conversation.snapshot().selection.error || previous.availability === options.availability)
      )
        return;
      requestedRoute.current = { node: requested, availability: options.availability };
      // Selection already published by the owner has just been reflected in Product navigation.
      if (conversation.conversation() === requested && !conversation.snapshot().selection.pending)
        return;
      later(
        (restoring ? conversation.restore(requested) : conversation.open(requested)).then(
          (outcome) => options.onSelectionOutcome?.(outcome),
        ),
      );
    } else {
      requestedRoute.current = undefined;
      later(conversation.restore(options.retainedConversation));
    }
  }, [conversation, options.conversation, options.retainedConversation, options.availability]);
  useEffect(() => () => conversation.dispose(), [conversation]);
  return conversation;
}
