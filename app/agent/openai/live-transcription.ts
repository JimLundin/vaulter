// OpenAI transcription-only WebRTC. Never asks the speech model to answer or execute tools.
// https://developers.openai.com/api/docs/guides/realtime-transcription
// https://developers.openai.com/api/docs/guides/realtime-webrtc
import type { TranscriptionProvider } from '../transcription.ts';
import { transcriptBuffer } from '../transcript.ts';
import { openAIWebRTC } from './webrtc.ts';

export const TRANSCRIPTION_MODEL = 'gpt-live-transcribe';
export const openAITranscription =
  (
    key: string,
    baseURL = 'https://api.openai.com/v1',
    options: { model?: string; fetch?: typeof fetch } = {},
  ): TranscriptionProvider =>
  async (events, signal) => {
    const transcript = transcriptBuffer();
    let transport: Awaited<ReturnType<typeof openAIWebRTC>> | undefined;
    let closed = false;
    let finishing = false;
    let finalItem: string | null = null;
    let finishResolve: ((text: string) => void) | null = null;
    let finishReject: ((error: Error) => void) | null = null;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(finishTimer);
      signal.removeEventListener('abort', aborted);
      finishReject?.(new DOMException('Recording cancelled', 'AbortError'));
      transport?.close();
    };
    const failed = (error: Error) => {
      finishReject?.(error);
      close();
      events.error(error);
    };
    const aborted = () => {
      const error = new DOMException('Recording cancelled', 'AbortError');
      finishReject?.(error);
      close();
    };
    signal.addEventListener('abort', aborted, { once: true });
    const finalized = () => {
      if (finishing && finalItem && transcript.final(finalItem)) {
        clearTimeout(finishTimer);
        finishResolve?.(transcript.text());
      }
    };
    const event = (event: Record<string, unknown>) => {
      if (closed) return;
      if (
        event.type === 'error' ||
        event.type === 'conversation.item.input_audio_transcription.failed'
      ) {
        failed(
          new Error(
            'OpenAI could not transcribe this recording. Your partial transcript is kept; try again or edit it.',
          ),
        );
        return;
      }
      transcript.accept(event);
      if (
        finishing &&
        event.type === 'input_audio_buffer.committed' &&
        typeof event.item_id === 'string'
      )
        finalItem = event.item_id;
      if (
        event.type === 'conversation.item.input_audio_transcription.delta' ||
        event.type === 'conversation.item.input_audio_transcription.completed'
      )
        events.text(transcript.text());
      finalized();
    };
    try {
      transport = await openAIWebRTC({
        apiKey: key,
        baseURL,
        fetch: options.fetch,
        signal,
        timeoutMs: 15_000,
        requestError: (path, status) =>
          path === 'realtime/client_secrets'
            ? `OpenAI transcription could not connect (${status}). Check your OpenAI key and API access.`
            : `OpenAI transcription could not connect (${status}). Try again or type a message.`,
        messages: {
          unavailable: 'Live transcription is unavailable in this browser. You can type a message.',
          credential: 'OpenAI did not return a transcription session credential.',
          channelClosed: 'The transcription connection closed. Your transcript is kept.',
          mediaLost: 'The microphone connection was lost. Your transcript is kept.',
          timeout: 'The microphone connection timed out. Try again or type.',
        },
        session: {
          type: 'transcription',
          audio: {
            input: {
              transcription: { model: options.model ?? TRANSCRIPTION_MODEL, delay: 'low' },
              turn_detection: null,
              noise_reduction: { type: 'near_field' },
            },
          },
        },
        event,
        error: failed,
      });
      if (closed || signal.aborted) {
        transport.close();
        throw new DOMException('Recording cancelled', 'AbortError');
      }
      return {
        close,
        async finish() {
          if (closed) throw new Error('The recording connection is closed.');
          if (finishing) throw new Error('This recording is already finishing.');
          finishing = true;
          transport!.mute(true);
          // Keep the peer alive while the last media packets and final transcript drain.
          await new Promise<void>((resolve) => setTimeout(resolve, 200));
          signal.throwIfAborted();
          return new Promise<string>((resolve, reject) => {
            finishResolve = resolve;
            finishReject = reject;
            finishTimer = setTimeout(
              () =>
                reject(
                  new Error(
                    'The final transcript timed out. Your partial text is kept; check it before sending.',
                  ),
                ),
              15_000,
            );
            try {
              transport!.send({ type: 'input_audio_buffer.commit' });
            } catch {
              reject(new Error('Could not finish this recording. Your partial text is kept.'));
            }
          });
        },
      };
    } catch (error) {
      close();
      throw error;
    }
  };
