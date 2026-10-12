import { expect, test, vi } from 'vitest';
import { createTranscription, type TranscriptionEvents } from './transcription.ts';
import { transcriptBuffer } from '../../agent/transcript.ts';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test('shows live text, waits for corrected final text, and releases capture without sending', async () => {
  let events!: TranscriptionEvents;
  let signal!: AbortSignal;
  const final = deferred<string>();
  const close = vi.fn();
  const finish = vi.fn(() => final.promise);
  const voice = createTranscription((callbacks, abort) => {
    events = callbacks;
    signal = abort;
    return Promise.resolve({ close, finish });
  });
  const changed = vi.fn();
  voice.subscribe(changed);
  await voice.start();
  expect(voice.snapshot().phase).toBe('listening');
  events.text('Leave space');
  expect(voice.snapshot().text).toBe('Leave space');
  events.text('Leave space for a walk');
  const done = voice.finish();
  expect(voice.snapshot().phase).toBe('finishing');
  expect(close).not.toHaveBeenCalled();
  final.resolve('Leave space for a walk.');
  await done;
  expect(voice.snapshot()).toMatchObject({
    phase: 'ready',
    text: 'Leave space for a walk.',
    error: '',
  });
  expect(signal.aborted).toBe(true);
  expect(close).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalled();
});

test('cancels a connection still opening and ignores late text and errors', async () => {
  let events!: TranscriptionEvents;
  const pending = deferred<{ close: () => void; finish: () => Promise<string> }>();
  const close = vi.fn();
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return pending.promise;
  });
  const starting = voice.start();
  expect(voice.snapshot().phase).toBe('connecting');
  voice.clear();
  events.text('Late words');
  events.error(new Error('Late failure'));
  pending.resolve({ close, finish: async () => '' });
  await starting;
  expect(voice.snapshot()).toMatchObject({ phase: 'idle', text: '', error: '' });
  expect(close).toHaveBeenCalledOnce();
});

test('interruption keeps partial transcript and ignores finalization after cancellation', async () => {
  let events!: TranscriptionEvents;
  const final = deferred<string>();
  const close = vi.fn();
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return Promise.resolve({ close, finish: () => final.promise });
  });
  await voice.start();
  events.text('Words so far');
  const finishing = voice.finish();
  voice.interrupt();
  expect(voice.snapshot().phase).toBe('error');
  expect(voice.snapshot().text).toBe('Words so far');
  final.resolve('Final late words');
  await finishing;
  expect(voice.snapshot().text).toBe('Words so far');
  expect(close).toHaveBeenCalledOnce();
});

test('permission failure and session errors leave typing available and preserve partial text', async () => {
  const denied = createTranscription(() =>
    Promise.reject(new DOMException('Denied', 'NotAllowedError')),
  );
  await denied.start();
  expect(denied.snapshot().phase).toBe('error');
  expect(denied.snapshot().error).toContain('Microphone access was denied');
  let events!: TranscriptionEvents;
  const close = vi.fn();
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return Promise.resolve({ close, finish: () => Promise.resolve('') });
  });
  await voice.start();
  events.text('Keep these words');
  events.error(new Error('Connection lost'));
  expect(voice.snapshot()).toMatchObject({
    phase: 'error',
    text: 'Keep these words',
    error: 'Connection lost',
  });
  expect(close).toHaveBeenCalledOnce();
});

test('disposal releases the microphone and does not publish late callbacks', async () => {
  let events!: TranscriptionEvents;
  const close = vi.fn();
  const changed = vi.fn();
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return Promise.resolve({ close, finish: () => Promise.resolve('') });
  });
  voice.subscribe(changed);
  await voice.start();
  voice.dispose();
  changed.mockClear();
  events.text('Late');
  events.error(new Error('Late'));
  expect(changed).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

test('reconciles corrected final text and out-of-order items, ignoring deltas after final', () => {
  const buffer = transcriptBuffer();
  buffer.accept({
    type: 'input_audio_buffer.committed',
    item_id: 'second',
    previous_item_id: 'first',
  });
  buffer.accept({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'second',
    transcript: 'Second sentence.',
  });
  buffer.accept({
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'first',
    delta: 'Furst',
  });
  expect(buffer.text()).toBe('Furst Second sentence.');
  buffer.accept({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'first',
    transcript: 'First sentence.',
  });
  buffer.accept({
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'first',
    delta: 'Late duplicate',
  });
  expect(buffer.text()).toBe('First sentence. Second sentence.');
  expect(buffer.final('first')).toBe(true);
});

test('destroyed recording ownership cannot be revived or changed by old callers', async () => {
  const voice = createTranscription(async () => ({
    close: () => undefined,
    finish: async () => 'Words',
  }));
  await voice.start();
  voice.dispose();
  const closed = voice.snapshot();
  voice.configure(null);
  voice.clear();
  voice.interrupt();
  await voice.start();
  await voice.finish();
  voice.dispose();
  expect(voice.snapshot()).toBe(closed);
  expect(voice.availability()).toBe('The recording session is closed.');
});

test('admitted capture keeps its provider when a synchronous observer updates later capabilities', async () => {
  const voice = createTranscription(async () => ({
    close: () => undefined,
    finish: async () => 'Original provider',
  }));
  let updated = false;
  const unsubscribe = voice.subscribe(() => {
    if (voice.snapshot().phase !== 'connecting' || updated) return;
    updated = true;
    voice.configure(async () => ({ close: () => undefined, finish: async () => 'Later provider' }));
  });
  try {
    await voice.start();
    await voice.finish();
    expect(voice.snapshot().text).toBe('Original provider');
    await voice.start();
    await voice.finish();
    expect(voice.snapshot().text).toBe('Later provider');
  } finally {
    unsubscribe();
    voice.dispose();
  }
});
