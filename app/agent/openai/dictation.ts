import type { FileTranscriptionProvider } from '@/agent/providers.ts';
import { recordedTranscription } from '@/agent/recorded-transcription.ts';
import type { TranscriptionProvider } from '@/agent/transcription.ts';
import { OpenAIRequestError } from './http.ts';

/** Keep dictation available on compatible APIs that expose file transcription without Realtime. */
export function openAIDictation(
  live: TranscriptionProvider,
  transcribe: FileTranscriptionProvider,
): TranscriptionProvider {
  const recorded = recordedTranscription(transcribe);
  let liveUnavailable = false;
  return async (events, signal) => {
    signal.throwIfAborted();
    if (!liveUnavailable) {
      try {
        return await live(events, signal);
      } catch (error) {
        if (
          !(
            error instanceof OpenAIRequestError &&
            ['realtime/client_secrets', 'realtime/calls'].includes(error.path) &&
            [404, 405, 501].includes(error.status)
          )
        )
          throw error;
        signal.throwIfAborted();
        liveUnavailable = true;
      }
    }
    return recorded(events, signal);
  };
}
