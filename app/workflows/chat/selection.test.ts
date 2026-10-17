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
      messages: async (conversation) => {
        if (hold) {
          await new Promise<void>((release) => {
            reads.push({ release });
          });
        }
        return source.messages(conversation);
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

test('New cannot create another dialogue or clear an unfinished draft', async () => {
  const { db, chat } = await fixture();
  await using _db = db;
  try {
    chat.setDraft('An unfinished thought');
    expect(chat.newChat()).toEqual({
      status: 'blocked',
      reason: 'Chat is one continuous dialogue.',
    });
    expect(chat.conversation()).toBe('dialogue');
    expect(chat.snapshot().draft).toBe('An unfinished thought');
    expect(await db.transaction((tx) => tx.entities.conversations.query({ select: {} }))).toEqual(
      [],
    );
  } finally {
    chat.dispose();
  }
});

test('latest eligible history read wins and preserves the shared draft when earlier reads finish late', async () => {
  const { db, chat, hold, reads } = await fixture();
  await using _db = db;
  try {
    chat.setDraft('An unfinished thought');
    hold();
    const earlier = chat.open('dialogue');
    const later = chat.open('dialogue');
    reads[1]!.release();
    expect(await later).toEqual({ status: 'selected', conversation: 'dialogue' });
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
    const explicit = chat.open('dialogue');
    reads[1]!.release();
    await explicit;
    reads[0]!.release();
    expect(await restoration).toEqual({ status: 'superseded' });
    expect(await chat.restore()).toEqual({ status: 'superseded' });
    expect(chat.conversation()).toBe('dialogue');
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
    const valid = chat.open('dialogue');
    await chat.captureAction();
    expect(await chat.open('dialogue')).toMatchObject({
      status: 'blocked',
      reason: expect.stringContaining('recording'),
    });
    expect(chat.snapshot()).toMatchObject({ draft: 'Prefix', capture: { phase: 'listening' } });
    await chat.captureAction();
    reads[0]!.release();
    expect(await valid).toMatchObject({ status: 'selected', conversation: 'dialogue' });
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
    const opening = chat.open('dialogue');
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
  const opening = chat.open('dialogue');
  const before = chat.snapshot();
  chat.dispose();
  reads[0]!.release();
  expect(await opening).toEqual({ status: 'superseded' });
  expect(chat.snapshot()).toBe(before);
});
