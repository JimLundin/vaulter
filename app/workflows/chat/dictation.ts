// Speech updates the same persistent draft as typing, even when no Chat view is mounted.
import { useEffect } from 'react';
interface Conversation {
  snapshot: () => { draft: string };
  setDraft: (text: string) => void;
}
import type { Transcription } from './transcription.ts';

export function bindVoiceDraft(conversation: Conversation, voice: Transcription) {
  let previous = voice.snapshot();
  let prefix = conversation.snapshot().draft;
  return voice.subscribe(() => {
    const next = voice.snapshot();
    if (next.phase === 'connecting' && previous.phase !== 'connecting')
      prefix = conversation.snapshot().draft;
    const changed = next.text !== previous.text;
    previous = next;
    if (!changed || next.phase === 'idle') return;
    const separator = prefix && next.text && !/\s$/.test(prefix) ? ' ' : '';
    conversation.setDraft(`${prefix}${separator}${next.text}`);
  });
}

export function useVoiceDraft(conversation: Conversation, voice: Transcription) {
  useEffect(() => bindVoiceDraft(conversation, voice), [conversation, voice]);
}
