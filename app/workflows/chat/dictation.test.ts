import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { createNodeConversation } from './node-conversation.ts';
import { bindVoiceDraft } from './dictation.ts';
import { createTranscription, type TranscriptionEvents } from './transcription.ts';
const controller = () =>
  createNodeConversation({
    nodes: memoryNodeBackend(),
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: '',
    availability: 'Offline',
    model: () => Promise.reject(new Error('Must not execute')),
  });

test('dictation replaces partials with corrected finals in the node Chat draft and appends after manual edits', async () => {
  const chat = controller();
  let events!: TranscriptionEvents;
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return Promise.resolve({
      close: () => {},
      finish: () => Promise.resolve('Corrected sentence.'),
    });
  });
  const unbind = bindVoiceDraft(chat, voice);
  chat.setDraft('Typed introduction.');
  await voice.start();
  events.text('Partial');
  expect(chat.snapshot().draft).toBe('Typed introduction. Partial');
  await voice.finish();
  expect(chat.snapshot().draft).toBe('Typed introduction. Corrected sentence.');
  voice.clear();
  chat.setDraft('Manually edited.\n');
  await voice.start();
  events.text('More words');
  expect(chat.snapshot().draft).toBe('Manually edited.\nMore words');
  voice.clear();
  events.text('Late words');
  expect(chat.snapshot().draft).toBe('Manually edited.\nMore words');
  unbind();
  voice.dispose();
  chat.dispose();
});

test('dictation errors and interruption retain accepted draft without replacing later manual corrections', async () => {
  const chat = controller();
  let events!: TranscriptionEvents;
  let finish!: (text: string) => void;
  const voice = createTranscription((callbacks) => {
    events = callbacks;
    return Promise.resolve({
      close: () => {},
      finish: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
  });
  const unbind = bindVoiceDraft(chat, voice);
  await voice.start();
  events.text('Keep these words');
  events.error(new Error('Disconnected'));
  expect(chat.snapshot().draft).toBe('Keep these words');
  chat.setDraft('Edited after failure.');
  await voice.start();
  events.text('More speech');
  const finishing = voice.finish();
  voice.interrupt();
  chat.setDraft('Corrected after interruption.');
  finish('Late correction');
  await finishing;
  expect(chat.snapshot().draft).toBe('Corrected after interruption.');
  expect(chat.snapshot().turns).toEqual([]);
  unbind();
  voice.dispose();
  chat.dispose();
});
