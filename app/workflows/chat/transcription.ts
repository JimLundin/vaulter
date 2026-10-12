// Live speech is a removable chat capability. The controller owns capture; views only render its state.
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';

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
  /** Identity and ordering of output owned by one recording session. */
  session: string | null;
  revision: number;
}

const message = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotAllowedError'
    ? 'Microphone access was denied. You can allow it in your browser or type a message.'
    : error instanceof Error
      ? error.message
      : 'The microphone could not connect. Try again or type a message.';

export function createTranscription(initial: TranscriptionProvider | null) {
  let provider = initial;
  let state: TranscriptionState = {
    phase: 'idle',
    text: '',
    error: '',
    session: null,
    revision: 0,
  };
  let abort: AbortController | null = null;
  let connection: TranscriptionConnection | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  const set = (next: Partial<TranscriptionState>) => {
    if (disposed) return;
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
  const availability = () =>
    disposed
      ? 'The recording session is closed.'
      : !provider
        ? 'Unlock an OpenAI key to use live transcription. You can still type.'
        : undefined;
  return {
    snapshot: () => state,
    closed: () => disposed,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    configure(next: TranscriptionProvider | null) {
      if (disposed) return;
      provider = next;
      set({});
    },
    availability,
    async start() {
      if (disposed || ['connecting', 'listening', 'finishing'].includes(state.phase)) return;
      if (!provider) {
        set({
          phase: 'error',
          error: 'Unlock an OpenAI key to use live transcription. You can still type.',
        });
        return;
      }
      const selectedProvider = provider;
      release();
      const request = new AbortController();
      abort = request;
      set({ phase: 'connecting', text: '', error: '', session: crypto.randomUUID(), revision: 0 });
      try {
        if (disposed || request.signal.aborted) return;
        const session = await selectedProvider(
          {
            text(text) {
              if (!request.signal.aborted) set({ text, revision: state.revision + 1 });
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
    async finish(session?: string) {
      if (disposed || (session !== undefined && session !== state.session)) return;
      if (state.phase !== 'listening' || !connection) return;
      const request = abort;
      set({ phase: 'finishing' });
      try {
        const text = await connection.finish();
        if (request?.signal.aborted) return;
        release();
        set({
          phase: text.trim() ? 'ready' : 'idle',
          text,
          error: '',
          revision: state.revision + 1,
        });
      } catch (error) {
        if (!request?.signal.aborted) fail(error);
      }
    },
    clear(session?: string) {
      if (disposed || (session !== undefined && session !== state.session)) return;
      release();
      set({ phase: 'idle', text: '', error: '', session: null, revision: 0 });
    },
    interrupt(session?: string) {
      if (disposed || (session !== undefined && session !== state.session)) return;
      if (!['connecting', 'listening', 'finishing'].includes(state.phase)) return;
      release();
      set({
        phase: 'error',
        error:
          'Recording stopped. Your text is kept in the message field; check it before sending.',
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
      listeners.clear();
    },
  };
}
export type Transcription = ReturnType<typeof createTranscription>;
export const useTranscript = (voice: Transcription) =>
  useSyncExternalStore(voice.subscribe, voice.snapshot);
export function useTranscription(provider: TranscriptionProvider | null, session?: object) {
  const [lifetime, setLifetime] = useState(() => ({
    session,
    voice: createTranscription(provider),
  }));
  let current = lifetime;
  if (lifetime.session !== session) {
    current = { session, voice: createTranscription(provider) };
    setLifetime(current);
  }
  const voice = current.voice;
  // biome-ignore lint/correctness/useExhaustiveDependencies: this effect owns the session, not capability updates.
  useLayoutEffect(() => {
    // Effect replay creates a fresh owner; disposed sessions never regain authority.
    const owned = voice.closed() ? createTranscription(provider) : voice;
    if (owned !== voice) setLifetime({ session, voice: owned });
    const hidden = () => {
      if (document.hidden) owned.interrupt();
    };
    const leaving = () => owned.interrupt();
    document.addEventListener('visibilitychange', hidden);
    addEventListener('pagehide', leaving);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      removeEventListener('pagehide', leaving);
      owned.dispose();
    };
  }, [session]);
  useEffect(() => {
    voice.configure(provider);
  }, [voice, provider]);
  return voice;
}
