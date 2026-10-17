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
    requested?: { availability?: string; backend: ConversationOptions['backend'] };
    startup: boolean;
  }>({ owner: conversation, startup: true });
  if (restoration.current.owner !== conversation)
    restoration.current = { owner: conversation, startup: true };
  // biome-ignore lint/correctness/useExhaustiveDependencies: capability readiness can retry startup reads; execution permission never gates them.
  useEffect(() => {
    if (options.recordsReady === false) return;
    const restoring = restoration.current.startup;
    restoration.current.startup = false;
    const previous = restoration.current.requested;
    if (
      previous &&
      previous.backend === options.backend &&
      (!conversation.snapshot().reading.error || previous.availability === options.availability)
    )
      return;
    restoration.current.requested = { availability: options.availability, backend: options.backend };
    later(
      (restoring ? conversation.restore() : conversation.reload()).then((outcome) => {
        if (!conversation.closed() && outcome.status !== 'superseded')
          options.onReadOutcome?.(outcome);
      }),
    );
  }, [conversation, options.backend, options.availability, options.recordsReady]);
  return conversation;
}
