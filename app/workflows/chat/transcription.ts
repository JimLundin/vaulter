// Live speech is a removable chat capability. The controller owns capture; views only render its state.
import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { TranscriptionProvider, TranscriptionConnection } from '../../agent/transcription.ts';
export type {
  TranscriptionProvider,
  TranscriptionConnection,
  TranscriptionEvents,
} from '../../agent/transcription.ts';
export interface TranscriptionState {
  phase: 'idle' | 'connecting' | 'listening' | 'finishing' | 'ready' | 'error';
  text: string;
  error: string;
}

const message = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'Microphone access was denied. You can allow it in your browser or type a message.'
    : error instanceof Error
      ? error.message
      : 'The microphone could not connect. Try again or type a message.';

export function createTranscription(initial: TranscriptionProvider | null) {
  let provider = initial;
  let state: TranscriptionState = { phase: 'idle', text: '', error: '' };
  let abort: AbortController | null = null;
  let connection: TranscriptionConnection | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  const set = (next: Partial<TranscriptionState>) => {
    state = { ...state, ...next };
    if (!disposed) for (const listener of listeners) listener();
  };
  const release = () => {
    abort?.abort();
    abort = null;
    connection?.close();
    connection = null;
  };
  const fail = (error: unknown) => {
    release();
    set({ phase: 'error', error: message(error) });
  };
  return {
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    configure(next: TranscriptionProvider | null) {
      provider = next;
    },
    async start() {
      if (disposed || ['connecting', 'listening', 'finishing'].includes(state.phase)) return;
      if (!provider) {
        set({
          phase: 'error',
          error: 'Unlock an OpenAI key to use live transcription. You can still type.',
        });
        return;
      }
      release();
      const request = new AbortController();
      abort = request;
      set({ phase: 'connecting', text: '', error: '' });
      try {
        const session = await provider(
          {
            text(text) {
              if (!request.signal.aborted) set({ text });
            },
            error(error) {
              if (!request.signal.aborted) fail(error);
            },
          },
          request.signal,
        );
        if (request.signal.aborted) {
          session.close();
          return;
        }
        connection = session;
        set({ phase: 'listening' });
      } catch (error) {
        if (!request.signal.aborted) fail(error);
      }
    },
    async finish() {
      if (state.phase !== 'listening' || !connection) return;
      const request = abort;
      set({ phase: 'finishing' });
      try {
        const text = await connection.finish();
        if (request?.signal.aborted) return;
        release();
        set({ phase: text.trim() ? 'ready' : 'idle', text, error: '' });
      } catch (error) {
        if (!request?.signal.aborted) fail(error);
      }
    },
    reset() {
      disposed = false;
    },
    clear() {
      release();
      set({ phase: 'idle', text: '', error: '' });
    },
    interrupt() {
      if (!['connecting', 'listening', 'finishing'].includes(state.phase)) return;
      release();
      set({
        phase: 'error',
        error:
          'Recording stopped. Your text is kept in the message field; check it before sending.',
      });
    },
    dispose() {
      disposed = true;
      release();
      listeners.clear();
    },
  };
}
export type Transcription = ReturnType<typeof createTranscription>;
export const useTranscript = (voice: Transcription) =>
  useSyncExternalStore(voice.subscribe, voice.snapshot);
export function useTranscription(provider: TranscriptionProvider | null) {
  const ref = useRef<Transcription | null>(null);
  if (!ref.current) ref.current = createTranscription(provider);
  const voice = ref.current;
  useEffect(() => {
    voice.configure(provider);
  }, [voice, provider]);
  useEffect(() => {
    voice.reset();
    const hidden = () => {
      if (document.hidden) voice.interrupt();
    };
    const leaving = () => voice.interrupt();
    document.addEventListener('visibilitychange', hidden);
    addEventListener('pagehide', leaving);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      removeEventListener('pagehide', leaving);
      voice.dispose();
    };
  }, [voice]);
  return voice;
}
