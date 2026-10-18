// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import type { FileTranscriptionProvider } from './providers.ts';
import { recordedTranscription } from './recorded-transcription.ts';

class Recorder {
  static isTypeSupported = (type: string) => type.startsWith('audio/webm');
  mimeType = 'audio/webm';
  state = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['recorded audio'], { type: this.mimeType }) });
    this.onstop?.();
  }
}
afterEach(() => vi.unstubAllGlobals());

function harness() {
  const track = { stop: vi.fn() };
  const microphone = { getTracks: () => [track] };
  const recorder = new Recorder();
  const getUserMedia = vi.fn(async () => microphone);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal(
    'MediaRecorder',
    class {
      static isTypeSupported = Recorder.isTypeSupported;
      constructor() {
        // biome-ignore lint/correctness/noConstructorReturn: emulate a browser MediaRecorder.
        return recorder;
      }
    },
  );
  const transcribe = vi.fn<FileTranscriptionProvider>().mockResolvedValue({
    text: 'Real spoken words',
    model: 'fixture',
    provider: 'openai',
  });
  return { track, microphone, recorder, getUserMedia, transcribe };
}

test('captures audio locally and stops the microphone before uploading on Finish', async () => {
  const { track, recorder, transcribe } = harness();
  transcribe.mockImplementation(async (audio) => {
    expect(track.stop).toHaveBeenCalled();
    expect(audio.name).toBe('recording.webm');
    expect(audio.type).toBe('audio/webm');
    expect(await audio.text()).toBe('recorded audio');
    return { text: 'Real spoken words', model: 'fixture', provider: 'openai' };
  });
  const events = { text: vi.fn(), error: vi.fn() };
  const { signal } = new AbortController();
  const connection = await recordedTranscription(transcribe)(events, signal);
  expect(recorder.state).toBe('recording');
  expect(transcribe).not.toHaveBeenCalled();
  expect(events.text).not.toHaveBeenCalled();
  expect(await connection.finish()).toBe('Real spoken words');
  expect(events.text).toHaveBeenCalledExactlyOnceWith('Real spoken words');
  expect(transcribe).toHaveBeenCalledExactlyOnceWith(expect.any(File), signal);
  expect(events.error).not.toHaveBeenCalled();
});

test('cancellation releases microphone capture without uploading', async () => {
  const { track, recorder, transcribe } = harness();
  const abort = new AbortController();
  const connection = await recordedTranscription(transcribe)(
    { text: vi.fn(), error: vi.fn() },
    abort.signal,
  );
  abort.abort();
  expect(recorder.state).toBe('inactive');
  expect(track.stop).toHaveBeenCalled();
  expect(transcribe).not.toHaveBeenCalled();
  await expect(connection.finish()).rejects.toThrow('closed');
});

test('cancellation while microphone permission is pending closes late tracks', async () => {
  const { track, microphone, transcribe, getUserMedia } = harness();
  let allow!: (stream: typeof microphone) => void;
  getUserMedia.mockImplementation(
    () =>
      new Promise((resolve) => {
        allow = resolve;
      }),
  );
  const abort = new AbortController();
  const opening = recordedTranscription(transcribe)(
    { text: vi.fn(), error: vi.fn() },
    abort.signal,
  );
  abort.abort();
  allow(microphone);
  await expect(opening).rejects.toThrow();
  expect(track.stop).toHaveBeenCalled();
  expect(transcribe).not.toHaveBeenCalled();
});

test('failed transcription releases capture without publishing replacement text', async () => {
  const { track, transcribe } = harness();
  transcribe.mockRejectedValue(new Error('Transcription failed (401)'));
  const events = { text: vi.fn(), error: vi.fn() };
  const connection = await recordedTranscription(transcribe)(events, new AbortController().signal);
  await expect(connection.finish()).rejects.toThrow('401');
  expect(track.stop).toHaveBeenCalled();
  expect(events.text).not.toHaveBeenCalled();
});

test('cancellation during upload suppresses a late transcript', async () => {
  const { transcribe } = harness();
  let complete!: (result: Awaited<ReturnType<FileTranscriptionProvider>>) => void;
  transcribe.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const events = { text: vi.fn(), error: vi.fn() };
  const abort = new AbortController();
  const connection = await recordedTranscription(transcribe)(events, abort.signal);
  const finishing = connection.finish();
  await vi.waitFor(() => expect(transcribe).toHaveBeenCalledOnce());
  abort.abort();
  complete({ text: 'Late transcript', model: 'fixture', provider: 'openai' });
  await expect(finishing).rejects.toThrow();
  expect(events.text).not.toHaveBeenCalled();
});

test('recorder failures and oversize audio release microphone tracks before any upload', async () => {
  const { track, recorder, transcribe } = harness();
  const events = { text: vi.fn(), error: vi.fn() };
  await recordedTranscription(transcribe)(events, new AbortController().signal);
  recorder.ondataavailable?.({ data: new Blob([new Uint8Array(25 * 1024 * 1024 + 1)]) });
  expect(events.error).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining('25 MB') }),
  );
  expect(track.stop).toHaveBeenCalled();
  expect(transcribe).not.toHaveBeenCalled();
});
