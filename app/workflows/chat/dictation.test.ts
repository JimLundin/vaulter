import { controlledChatStorage } from './controller-storage.test-support.ts';
import { chatFixture } from './fixtures.test-support.ts';
import { expect, test, vi } from 'vitest';
import { createConversation } from './conversation.ts';
import { createTranscription, type TranscriptionEvents } from '@/transcription.ts';

const controller = async (transcription: ReturnType<typeof createTranscription>) => {
  const { db, options } = await chatFixture();
  const chat = createConversation({ ...options, availability: 'Offline', transcription });
  const { dispose } = chat;
  return {
    ...chat,
    dispose: async () => {
      dispose();
      await db[Symbol.asyncDispose]();
    },
  };
};

test('Chat capture replaces partials with corrected finals and preserves the starting draft prefix without a mounted view', async () => {
  let events!: TranscriptionEvents;
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return Promise.resolve({ close: () => {}, finish: async () => 'Corrected sentence.' });
  });
  const chat = await controller(voice);
  chat.setDraft('Typed introduction.');
  await chat.captureAction();
  events.text('Partial');
  expect(chat.snapshot().draft).toBe('Typed introduction. Partial');
  expect(chat.snapshot().capture).toMatchObject({ action: 'finish', allowed: true });
  await chat.captureAction();
  expect(chat.snapshot().draft).toBe('Typed introduction. Corrected sentence.');
  expect(chat.snapshot().turns).toEqual([]);
  chat.setDraft('Manually edited.\n');
  await chat.captureAction();
  events.text('More words');
  expect(chat.snapshot().draft).toBe('Manually edited.\nMore words');
  await chat.dispose();
  voice.dispose();
});

test('New and Send cannot replace the recording association or clear its draft while capture is active', async () => {
  let events!: TranscriptionEvents;
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return Promise.resolve({ close: () => {}, finish: async () => 'Final words' });
  });
  const chat = await controller(voice);
  chat.setDraft('Keep prefix');
  const original = chat.conversation();
  await chat.captureAction();
  events.text('Partial');
  chat.newChat();
  expect(chat.prepareSubmission()).toMatchObject({
    status: 'blocked',
    reason: 'Finish or cancel the current recording before sending.',
  });
  expect(chat.conversation()).toBe(original);
  expect(chat.snapshot().draft).toBe('Keep prefix Partial');
  expect(chat.snapshot().capture.phase).toBe('listening');
  await chat.captureAction();
  expect(chat.snapshot().draft).toBe('Keep prefix Final words');
  await chat.dispose();
  voice.dispose();
});

test('manual replacement cancels capture and rejects a final correction whose resource cleanup finishes later', async () => {
  let events!: TranscriptionEvents;
  let final!: (text: string) => void;
  let released = false;
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return Promise.resolve({
      close: () => {
        released = true;
      },
      finish: () =>
        new Promise<string>((resolve) => {
          final = resolve;
        }),
    });
  });
  const chat = await controller(voice);
  await chat.captureAction();
  events.text('Words so far');
  const finishing = chat.captureAction();
  expect(chat.snapshot().capture).toMatchObject({ action: 'wait', allowed: false });
  expect(await chat.captureAction()).toMatchObject({ status: 'blocked' });
  chat.setDraft('My manual correction');
  expect(released).toBe(true);
  events.text('Late partial');
  final('Late final correction');
  await finishing;
  expect(chat.snapshot().draft).toBe('My manual correction');
  expect(chat.snapshot().capture.phase).toBe('idle');
  await chat.dispose();
  voice.dispose();
});

test('cancel during microphone opening keeps the draft and releases a late connection without accepting its output', async () => {
  let events!: TranscriptionEvents;
  let opened!: (connection: { close: () => void; finish: () => Promise<string> }) => void;
  let released = false;
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return new Promise((resolve) => {
      opened = resolve;
    });
  });
  const chat = await controller(voice);
  chat.setDraft('Typed first');
  const starting = chat.captureAction();
  expect(chat.snapshot().capture).toMatchObject({ action: 'cancel', allowed: true });
  await chat.captureAction();
  events.text('Late words');
  events.error(new Error('Late error'));
  opened({
    close: () => {
      released = true;
    },
    finish: async () => 'Late final',
  });
  await starting;
  expect(released).toBe(true);
  expect(chat.snapshot().draft).toBe('Typed first');
  expect(chat.snapshot().capture).toMatchObject({ phase: 'idle', error: '' });
  await chat.dispose();
  voice.dispose();
});

test('recording errors and interruption preserve applied text and leave draft editing available', async () => {
  let events!: TranscriptionEvents;
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return Promise.resolve({ close: () => {}, finish: async () => '' });
  });
  const chat = await controller(voice);
  await chat.captureAction();
  events.text('Keep these words');
  events.error(new Error('Connection lost'));
  expect(chat.snapshot()).toMatchObject({
    draft: 'Keep these words',
    capture: { phase: 'error', error: 'Connection lost' },
  });
  chat.setDraft('Edited after failure.');
  await chat.captureAction();
  events.text('More speech');
  voice.interrupt();
  expect(chat.snapshot().draft).toBe('Edited after failure. More speech');
  chat.setDraft('Corrected after interruption.');
  events.text('Late correction');
  expect(chat.snapshot().draft).toBe('Corrected after interruption.');
  await chat.dispose();
  voice.dispose();
});

test('capture reports missing transcription while the retained draft remains editable', async () => {
  const voice = createTranscription(null);
  const chat = await controller(voice);
  chat.setDraft('Type without a microphone');
  expect(chat.snapshot().capture).toMatchObject({ action: 'start', allowed: false });
  expect(await chat.captureAction()).toMatchObject({ status: 'blocked' });
  expect(chat.snapshot().draft).toBe('Type without a microphone');
  await chat.dispose();
  voice.dispose();
});

test('Chat rejects starting capture during execution or unresolved save recovery without opening the microphone', async () => {
  let opened = false;
  const voice = createTranscription(() => {
    opened = true;
    return Promise.resolve({ close: () => undefined, finish: async () => '' });
  });
  const { db, options } = await chatFixture(
    controlledChatStorage(async () => {
      throw new Error('Offline');
    }),
  );
  const chat = createConversation({ ...options, transcription: voice });
  chat.setDraft('Keep this draft');
  const sending = chat.prepareSubmission({ text: 'A separate request' });
  if (sending.status !== 'owned') throw new Error('Expected retained request');
  expect(chat.snapshot().busy).toBe(true);
  expect(await chat.captureAction()).toMatchObject({
    status: 'blocked',
    reason: 'Wait for the Agent to finish.',
  });
  await vi.waitFor(() => expect(chat.snapshot().persistenceError).toBeTruthy());
  expect(await chat.captureAction()).toMatchObject({
    status: 'blocked',
    reason: 'Resolve the pending recovery before recording.',
  });
  expect(opened).toBe(false);
  expect(chat.snapshot().draft).toBe('Keep this draft');
  await chat.dispose();
  voice.dispose();
  await sending.done;
  await db[Symbol.asyncDispose]();
});
