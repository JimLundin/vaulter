import type { FileTranscriptionProvider } from './providers.ts';
import type { TranscriptionProvider } from '@/modules/transcription/index.ts';

/** Browser microphone capture for providers that accept recordings rather than live media. */
export function recordedTranscription(
  transcribe: FileTranscriptionProvider,
): TranscriptionProvider {
  return async (events, signal) => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
      throw new Error(
        'Microphone recording is unavailable in this browser. You can type a message.',
      );
    signal.throwIfAborted();
    const microphone = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const stopTracks = () => {
      for (const track of microphone.getTracks()) track.stop();
    };
    if (signal.aborted) {
      stopTracks();
      signal.throwIfAborted();
    }
    let recorder: MediaRecorder;
    try {
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      recorder = new MediaRecorder(microphone, mimeType ? { mimeType } : undefined);
    } catch (error) {
      stopTracks();
      throw error;
    }
    let closed = false;
    let finishing = false;
    let size = 0;
    let chunks: Blob[] = [];
    let resolveStopped: (() => void) | undefined;
    let rejectStopped: ((error: Error) => void) | undefined;
    const close = () => {
      if (closed) return;
      closed = true;
      signal.removeEventListener('abort', close);
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      stopTracks();
      chunks = [];
      rejectStopped?.(new DOMException('Recording cancelled', 'AbortError'));
    };
    const failed = (error: Error) => {
      if (closed) return;
      close();
      events.error(error);
    };
    recorder.ondataavailable = ({ data }) => {
      if (closed || !data.size) return;
      size += data.size;
      if (size > 25 * 1024 * 1024) {
        failed(
          new Error('The recording reached 25 MB. Try a shorter recording. Your draft is kept.'),
        );
        return;
      }
      chunks.push(data);
    };
    recorder.onerror = () =>
      failed(new Error('The microphone recording failed. Your draft is kept.'));
    recorder.onstop = () => {
      stopTracks();
      if (finishing) resolveStopped?.();
      else failed(new Error('The microphone recording stopped unexpectedly. Your draft is kept.'));
    };
    signal.addEventListener('abort', close, { once: true });
    try {
      recorder.start(1000);
    } catch (error) {
      close();
      throw error;
    }
    return {
      close,
      async finish() {
        if (closed) throw new Error('The recording is closed.');
        if (finishing) throw new Error('This recording is already finishing.');
        finishing = true;
        try {
          await new Promise<void>((resolve, reject) => {
            resolveStopped = resolve;
            rejectStopped = reject;
            recorder.stop();
            stopTracks();
          });
          signal.throwIfAborted();
          const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
          const extension = type.includes('mp4') ? 'm4a' : 'webm';
          const audio = new File(chunks, `recording.${extension}`, { type });
          chunks = [];
          const result = await transcribe(audio, signal);
          signal.throwIfAborted();
          if (closed) throw new DOMException('Recording cancelled', 'AbortError');
          events.text(result.text);
          return result.text;
        } finally {
          close();
        }
      },
    };
  };
}
