import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { later } from '@/runtime/later.ts';
import { createConversation, type ConversationOptions, type Conversation } from './conversation.ts';

export const useChat = (conversation: Conversation) =>
  useSyncExternalStore(conversation.subscribe, conversation.snapshot);
export function useConversation(options: ConversationOptions) {
  const session = options.session;
  const [lifetime, setLifetime] = useState(() => ({
    session,
    conversation: createConversation(options),
  }));
  let current = lifetime;
  if (lifetime.session !== session) {
    current = { session, conversation: createConversation(options) };
    setLifetime(current);
  }
  const conversation = current.conversation;
  // biome-ignore lint/correctness/useExhaustiveDependencies: this effect owns the session, not capability updates.
  useLayoutEffect(() => {
    const owned = conversation.closed() ? createConversation(options) : conversation;
    if (owned !== conversation) setLifetime({ session, conversation: owned });
    return () => owned.dispose();
  }, [session]);
  // Publish changed owner availability after render and before any browser action can run.
  useLayoutEffect(() => {
    conversation.updateOptions(options);
  }, [conversation, options]);
  const restoration = useRef<{
    owner: Conversation;
    requested?: { node: string; availability?: string };
    startup: boolean;
  }>({ owner: conversation, startup: true });
  if (restoration.current.owner !== conversation)
    restoration.current = { owner: conversation, startup: true };
  // biome-ignore lint/correctness/useExhaustiveDependencies: capability readiness can retry startup reads; execution permission never gates them.
  useEffect(() => {
    if (options.recordsReady === false) return;
    const restoring = restoration.current.startup;
    restoration.current.startup = false;
    const requested = conversation.continuous ? 'dialogue' : options.conversation;
    if (requested) {
      const previous = restoration.current.requested;
      if (
        previous?.node === requested &&
        (!conversation.snapshot().selection.error || previous.availability === options.availability)
      )
        return;
      restoration.current.requested = { node: requested, availability: options.availability };
      // Selection already published by the owner has just been reflected in Application navigation.
      if (
        !(restoring && conversation.continuous) &&
        conversation.conversation() === requested &&
        !conversation.snapshot().selection.pending &&
        !conversation.snapshot().selection.error
      )
        return;
      later(
        (restoring ? conversation.restore(requested) : conversation.open(requested)).then(
          (outcome) => {
            if (!conversation.closed() && outcome.status !== 'superseded')
              options.onSelectionOutcome?.(outcome);
          },
        ),
      );
    } else {
      restoration.current.requested = undefined;
    }
  }, [conversation, options.conversation, options.availability, options.recordsReady]);
  return conversation;
}
