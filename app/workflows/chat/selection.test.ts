import { expect, test } from 'vitest';
import { createConversation, type ConversationOptions } from './conversation.ts';
import { chatFixture } from './fixtures.test-support.ts';
import { createTranscription } from '@/transcription.ts';

async function fixture() {
  const { db, options } = await chatFixture();
  const reads: { release: () => void }[] = [];
  let hold = false;
  const backend: ConversationOptions['backend'] = (value) => {
    const source = options.backend(value);
    return {
      ...source,
      messages: async () => {
        if (hold) {
          await new Promise<void>((release) => {
            reads.push({ release });
          });
        }
        return source.messages();
      },
    };
  };
  const configured = { ...options, backend, availability: 'Configure a model before sending.' };
  return {
    db,
    chat: createConversation(configured),
    options: configured,
    reads,
    hold: () => {
      hold = true;
    },
  };
}

test('latest eligible history read wins and preserves the shared draft when earlier reads finish late', async () => {
  const { db, chat, hold, reads } = await fixture();
  await using _db = db;
  try {
    chat.setDraft('An unfinished thought');
    hold();
    const earlier = chat.reload();
    const later = chat.reload();
    reads[1]!.release();
    expect(await later).toEqual({ status: 'loaded' });
    reads[0]!.release();
    expect(await earlier).toEqual({ status: 'superseded' });
    expect(chat.snapshot().draft).toBe('An unfinished thought');
  } finally {
    chat.dispose();
  }
});

test('explicit history reload supersedes startup restoration during its read', async () => {
  const { db, chat, hold, reads } = await fixture();
  await using _db = db;
  try {
    hold();
    const restoration = chat.restore();
    const explicit = chat.reload();
    reads[1]!.release();
    await explicit;
    reads[0]!.release();
    expect(await restoration).toEqual({ status: 'superseded' });
    expect(await chat.restore()).toEqual({ status: 'superseded' });
  } finally {
    chat.dispose();
  }
});

test('an ineligible history reload does not cancel an eligible read or change capture and draft', async () => {
  const { db, chat, options, hold, reads } = await fixture();
  await using _db = db;
  const voice = createTranscription(async () => ({ close() {}, finish: async () => 'Final' }));
  try {
    chat.updateOptions({ ...options, transcription: voice });
    chat.setDraft('Prefix');
    hold();
    const valid = chat.reload();
    await chat.captureAction();
    expect(await chat.reload()).toMatchObject({
      status: 'blocked',
      reason: expect.stringContaining('recording'),
    });
    expect(chat.snapshot()).toMatchObject({ draft: 'Prefix', capture: { phase: 'listening' } });
    await chat.captureAction();
    reads[0]!.release();
    expect(await valid).toMatchObject({ status: 'loaded' });
    expect(chat.snapshot().draft).toBe('Prefix Final');
  } finally {
    chat.dispose();
    voice.dispose();
  }
});

test('history reload rechecks capture after reading and preserves the current draft', async () => {
  const { db, chat, options, hold, reads } = await fixture();
  await using _db = db;
  const voice = createTranscription(async () => ({ close() {}, finish: async () => 'Final' }));
  try {
    chat.updateOptions({ ...options, transcription: voice });
    chat.setDraft('Prefix');
    hold();
    const opening = chat.reload();
    await chat.captureAction();
    reads[0]!.release();
    expect(await opening).toMatchObject({ status: 'blocked' });
    expect(chat.snapshot()).toMatchObject({
      draft: 'Prefix',
      turns: [],
      capture: { phase: 'listening' },
    });
  } finally {
    chat.dispose();
    voice.dispose();
  }
});

test('disposal invalidates held history completion and retains the closed snapshot', async () => {
  const { db, chat, hold, reads } = await fixture();
  await using _db = db;
  hold();
  const opening = chat.reload();
  const before = chat.snapshot();
  chat.dispose();
  reads[0]!.release();
  expect(await opening).toEqual({ status: 'superseded' });
  expect(chat.snapshot()).toBe(before);
});
