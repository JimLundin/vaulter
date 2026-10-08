// OpenAI transcription-only WebRTC. Never asks the speech model to answer or execute tools.
// https://developers.openai.com/api/docs/guides/realtime-transcription
// https://developers.openai.com/api/docs/guides/realtime-webrtc
import type { TranscriptionProvider } from './transcription.ts';
import { transcriptBuffer } from './transcript.ts';

export const TRANSCRIPTION_MODEL = 'gpt-live-transcribe';
export const openAITranscription =
  (key: string, baseURL = 'https://api.openai.com/v1'): TranscriptionProvider =>
  async (events, signal) => {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined')
      throw new Error('Live transcription is unavailable in this browser. You can type a message.');
    signal.throwIfAborted();
    const root = baseURL.replace(/\/$/, '');
    const api = root.endsWith('/v1') ? root : `${root}/v1`;
    const peer = new RTCPeerConnection();
    const channel = peer.createDataChannel('oai-events');
    const transcript = transcriptBuffer();
    let microphone: MediaStream | null = null;
    let closed = false;
    let finishing = false;
    let finalItem: string | null = null;
    let finishResolve: ((text: string) => void) | null = null;
    let finishReject: ((error: Error) => void) | null = null;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    let readyResolve: (() => void) | null = null;
    let readyReject: ((error: Error) => void) | null = null;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(finishTimer);
      clearTimeout(readyTimer);
      signal.removeEventListener('abort', aborted);
      for (const track of microphone?.getTracks() ?? []) track.stop();
      channel.onmessage = null;
      channel.onopen = null;
      channel.onclose = null;
      peer.onconnectionstatechange = null;
      channel.close();
      peer.close();
    };
    const failed = (error: Error) => {
      readyReject?.(error);
      finishReject?.(error);
      close();
      events.error(error);
    };
    const aborted = () => {
      const error = new DOMException('Recording cancelled', 'AbortError');
      readyReject?.(error);
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
    channel.onmessage = ({ data }) => {
      if (closed) return;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }
      if (!event || typeof event !== 'object') return;
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
    channel.onclose = () => {
      if (!closed)
        failed(new Error('The transcription connection closed. Your transcript is kept.'));
    };
    peer.onconnectionstatechange = () => {
      if (!closed && ['failed', 'disconnected', 'closed'].includes(peer.connectionState))
        failed(new Error('The microphone connection was lost. Your transcript is kept.'));
    };
    try {
      microphone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (signal.aborted) {
        for (const track of microphone.getTracks()) track.stop();
        signal.throwIfAborted();
      }
      for (const track of microphone.getAudioTracks()) {
        track.enabled = false;
        peer.addTrack(track, microphone);
      }
      // This personal static app already owns its user's unlocked key. Mint a short-lived, scoped
      // secret for the media connection; never put either credential in storage, markup or logs.
      const tokenResponse = await fetch(`${api}/realtime/client_secrets`, {
        method: 'POST',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expires_after: { anchor: 'created_at', seconds: 60 },
          session: {
            type: 'transcription',
            audio: {
              input: {
                transcription: { model: TRANSCRIPTION_MODEL, delay: 'low' },
                turn_detection: null,
                noise_reduction: { type: 'near_field' },
              },
            },
          },
        }),
      });
      if (!tokenResponse.ok)
        throw new Error(
          `OpenAI transcription could not connect (${tokenResponse.status}). Check your OpenAI key and API access.`,
        );
      const token: { value?: string } = await tokenResponse.json();
      if (!token.value)
        throw new Error('OpenAI did not return a transcription session credential.');
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const answer = await fetch(`${api}/realtime/calls`, {
        method: 'POST',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
        headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });
      if (!answer.ok)
        throw new Error(
          `OpenAI transcription could not connect (${answer.status}). Try again or type a message.`,
        );
      await peer.setRemoteDescription({ type: 'answer', sdp: await answer.text() });
      signal.throwIfAborted();
      if (channel.readyState !== 'open')
        await new Promise<void>((resolve, reject) => {
          readyResolve = resolve;
          readyReject = reject;
          channel.onopen = () => {
            clearTimeout(readyTimer);
            readyResolve?.();
          };
          readyTimer = setTimeout(
            () => reject(new Error('The microphone connection timed out. Try again or type.')),
            15_000,
          );
        });
      signal.throwIfAborted();
      if (closed) throw new Error('The microphone connection closed before recording started.');
      for (const track of microphone.getAudioTracks()) track.enabled = true;
      return {
        close,
        async finish() {
          if (closed) throw new Error('The recording connection is closed.');
          if (finishing) throw new Error('This recording is already finishing.');
          finishing = true;
          for (const track of microphone?.getAudioTracks() ?? []) track.enabled = false;
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
              channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
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
