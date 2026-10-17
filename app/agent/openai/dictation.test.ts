// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { openAIDictation } from './dictation.ts';
import { OpenAIRequestError } from './http.ts';
import type { FileTranscriptionProvider } from '@/agent/providers.ts';
import type { TranscriptionProvider } from '@/agent/transcription.ts';

afterEach(() => vi.unstubAllGlobals());

function recorder() {
  const stop = vi.fn();
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop }] }) },
  });
  vi.stubGlobal(
    'MediaRecorder',
    class {
      static isTypeSupported = () => true;
      mimeType = 'audio/webm';
      state = 'inactive';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['fictional audio'], { type: this.mimeType }) });
        this.onstop?.();
      }
    },
  );
  return { stop };
}

test.each([404, 405, 501])(
  'a missing Realtime route (%s) falls back once and uploads only on Finish',
  async (status) => {
    const { stop } = recorder();
    const live = vi
      .fn<TranscriptionProvider>()
      .mockRejectedValue(
        new OpenAIRequestError('realtime/client_secrets', status, 'Unavailable route'),
      );
    const transcribe = vi.fn<FileTranscriptionProvider>().mockImplementation(() => {
      expect(stop).toHaveBeenCalled();
      return Promise.resolve({ text: 'Dictated text', model: 'fictional', provider: 'openai' });
    });
    const dictation = openAIDictation(live, transcribe);
    const events = { text: vi.fn(), error: vi.fn() };
    const connection = await dictation(events, new AbortController().signal);
    expect(transcribe).not.toHaveBeenCalled();
    expect(await connection.finish()).toBe('Dictated text');
    expect(events.text).toHaveBeenCalledWith('Dictated text');
    const next = await dictation(events, new AbortController().signal);
    next.close();
    expect(live).toHaveBeenCalledOnce();
    expect(transcribe).toHaveBeenCalledOnce();
  },
);

test.each([401, 403, 429, 500])(
  'a genuine upstream failure (%s) is preserved without falling back',
  async (status) => {
    const live = vi
      .fn<TranscriptionProvider>()
      .mockRejectedValue(
        new OpenAIRequestError('realtime/client_secrets', status, `Connection failed (${status})`),
      );
    const transcribe = vi.fn<FileTranscriptionProvider>();
    const dictation = openAIDictation(live, transcribe);
    await expect(
      dictation({ text: vi.fn(), error: vi.fn() }, new AbortController().signal),
    ).rejects.toThrow(`Connection failed (${status})`);
    expect(transcribe).not.toHaveBeenCalled();
  },
);

test('cancellation during the failed live request cannot start a replacement recording', async () => {
  const { stop } = recorder();
  const abort = new AbortController();
  const live = vi.fn<TranscriptionProvider>().mockImplementation(() => {
    abort.abort();
    return Promise.reject(
      new OpenAIRequestError('realtime/client_secrets', 404, 'Unavailable route'),
    );
  });
  const transcribe = vi.fn<FileTranscriptionProvider>();
  await expect(
    openAIDictation(live, transcribe)({ text: vi.fn(), error: vi.fn() }, abort.signal),
  ).rejects.toThrow();
  expect(stop).not.toHaveBeenCalled();
  expect(transcribe).not.toHaveBeenCalled();
});

test('available live dictation keeps its connection without uploading a recording', async () => {
  const connection = { finish: vi.fn(() => Promise.resolve('Live text')), close: vi.fn() };
  const live = vi.fn<TranscriptionProvider>().mockResolvedValue(connection);
  const transcribe = vi.fn<FileTranscriptionProvider>();
  expect(
    await openAIDictation(live, transcribe)(
      { text: vi.fn(), error: vi.fn() },
      new AbortController().signal,
    ),
  ).toBe(connection);
  expect(transcribe).not.toHaveBeenCalled();
});
