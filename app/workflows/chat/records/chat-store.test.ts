import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../../../vault/nodes/memory.ts';
import { create, request, seed, revise } from '../../../vault/nodes/fixtures.test-support.ts';
import {
  parseConversation,
  parseExchange,
  parseMessage,
  parseChatReference,
} from './chat-schema.ts';
import { parseMetadata, parseMetadataReference } from './chat-metadata-schema.ts';
import {
  prepareChatSubmission,
  prepareChatResponse,
  savedChats,
  savedMessages,
} from './chat-store.ts';
import { chatOperations, preservesChatRecords } from './chat.ts';
import type { MessageData } from './chat.ts';

const at = '2026-10-10T12:00:00Z';
const submit = (transaction = 'send', conversation = 'conversation') => ({
  transaction,
  conversation,
  user: 'user',
  text: 'Keep studio mornings free.',
  at,
  model: 'fictional',
});
const response: Extract<MessageData, { role: 'agent' }> = {
  kind: 'message',
  role: 'agent',
  at,
  status: 'complete',
  parts: [{ kind: 'text', text: 'Recorded.' }],
  model: 'fictional',
  tokens: { in: 5, out: 2 },
};

test('submission and terminal response are independently retriable and append no ancestor versions', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  await store.commit(
    request('agent', [create('agent', { kind: 'actor', name: 'Fictional agent' })]),
  );
  const submission = await prepareChatSubmission(store, submit());
  expect(Object.isFrozen(submission.changes)).toBe(true);
  const accepted = await store.commit(submission);
  expect(await store.commit(submission)).toEqual(accepted);
  const before = await store.snapshot();
  const running = await savedMessages(store, 'conversation');
  expect(running.map(({ data }) => data.role)).toEqual(['user', 'agent']);
  expect(running[1].data).toMatchObject({ status: 'running' });
  const terminal = prepareChatResponse(submission, response, 'agent');
  const completed = await store.commit(terminal);
  expect(await store.commit(terminal)).toEqual(completed);
  expect(await store.changes(terminal.id)).toHaveLength(1);
  const after = await store.snapshot();
  expect(after.get('conversation')).toBe(before.get('conversation'));
  expect(after.get(submission.origin!)).toBe(before.get(submission.origin!));
  expect(after.get(running[0].version.key.node)).toBe(running[0].version);
  expect((await savedMessages(store, 'conversation'))[1].data).toEqual(response);
  expect((await savedMessages(store, 'conversation', before.sequence))[1].data).toMatchObject({
    status: 'running',
    parts: [],
  });
  const append = await prepareChatSubmission(store, submit('send-again'));
  expect(append.changes).toHaveLength(3);
  await store.commit(append);
  expect((await savedMessages(store, 'conversation')).map(({ data }) => data.role)).toEqual([
    'user',
    'agent',
    'user',
    'agent',
  ]);
  expect((await savedChats(store)).map(({ node }) => node)).toEqual(['conversation']);
  store.close();
});

test('stale author and conversation reads reject acceptance without partial messages', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  const submission = await prepareChatSubmission(store, submit());
  await store.commit(
    request('changed-user', [await revise(store, 'user', { kind: 'actor', name: 'Changed' })]),
  );
  await expect(store.commit(submission)).rejects.toThrow('Conflict');
  expect((await store.snapshot()).get('conversation')).toBeUndefined();
  const accepted = await prepareChatSubmission(store, submit('accepted'));
  await store.commit(accepted);
  const pending = await prepareChatSubmission(store, submit('pending'));
  await store.commit(request('delete-chat', [await revise(store, 'conversation', null)]));
  await expect(store.commit(pending)).rejects.toThrow('Conflict');
  expect(await savedChats(store)).toEqual([]);
  await expect(prepareChatSubmission(store, submit('another'))).rejects.toThrow();
  store.close();
});

test('terminal state validation prevents running responses and timestamp replacement', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  const submission = await prepareChatSubmission(store, submit());
  expect(() => prepareChatResponse(submission, { ...response, status: 'running' }, 'user')).toThrow(
    'running',
  );
  expect(() =>
    prepareChatResponse(submission, { ...response, at: '2026-10-11T12:00:00Z' }, 'user'),
  ).toThrow('timestamp');
  for (const status of ['stopped', 'failed', 'interrupted'] as const) {
    const terminal = prepareChatResponse(submission, { ...response, status }, 'user');
    expect(terminal.kind).toEqual(
      status === 'stopped' ? chatOperations.stopResponse : chatOperations.completeResponse,
    );
    expect(terminal.changes[0].data?.status).toBe(status);
  }
  store.close();
});

test('payload validation retains unknown nested JSON and special keys without mutating inputs', () => {
  const value = JSON.parse(
    '{"kind":"message","role":"agent","at":"2026-10-10T12:00:00Z","status":"complete","parts":[{"kind":"tool","callId":"c","name":"read","input":{"__proto__":{"retained":true}},"status":"complete","output":null,"future":{"x":1}}],"future":{"__proto__":{"retained":true}},"__proto__":{"own":true}}',
  );
  const parsed = parseMessage(value);
  expect(parsed).toEqual(value);
  expect(Object.hasOwn(parsed, '__proto__')).toBe(true);
  expect(Object.isFrozen(parsed)).toBe(true);
  value.future.changed = true;
  expect(parsed).not.toEqual(value);
  for (const [parse, data] of [
    [parseConversation, { kind: 'conversation', title: 'Studio', createdAt: at }],
    [parseExchange, { kind: 'exchange', startedAt: at }],
    [parseChatReference, { kind: 'reference', role: 'topic', label: 'Studio' }],
    [parseMetadataReference, { kind: 'metadataReference', role: 'evidence' }],
    [
      parseMetadata,
      {
        kind: 'contextInput',
        role: 'user',
        position: 0,
        transformation: 'verbatim',
        content: 'Hello',
      },
    ],
  ] as const) {
    const payload = { ...data, future: JSON.parse('{"__proto__":{"x":1}}') };
    expect(parse(payload)).toEqual(payload);
  }
});

test('retained summaries preserve their text and day precision without assigning a speaker', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  const summary = {
    kind: 'message',
    role: 'record',
    at: '2026-06-05T00:00:00+02:00',
    atPrecision: 'day',
    text: '## Morning\n\nKept **studio time** free.\n',
    record: { kind: 'summary', label: 'Daily summary', future: { retained: true } },
  };
  expect(parseMessage(summary)).toEqual(summary);
  expect(() => parseMessage({ ...summary, record: { kind: 'transcript' } })).toThrow();
  await store.commit(
    request('retained-summary', [
      create('daily', {
        kind: 'conversation',
        title: 'Studio time',
        createdAt: summary.at,
        createdAtPrecision: 'day',
      }),
      create(
        'day',
        { kind: 'exchange', startedAt: summary.at, startedAtPrecision: 'day' },
        'daily',
      ),
      create('summary', summary, 'day'),
    ]),
  );
  const messages = await savedMessages(store, 'daily');
  expect(messages).toHaveLength(1);
  expect(messages[0]?.data).toEqual(summary);
  expect(messages[0]?.version.key).toEqual({ node: 'summary', transaction: 'retained-summary' });
  expect((await savedChats(store))[0]?.activeAt).toBe(summary.at);
  store.close();
});

test('known schema violations and non-JSON extensions are rejected', () => {
  expect(() => parseMessage({ ...response, tokens: { in: -1, out: 2 } })).toThrow();
  expect(() => parseMessage({ ...response, future: undefined })).toThrow();
  expect(() =>
    parseMessage({
      ...response,
      parts: [{ kind: 'tool', callId: 'c', name: 'read', input: Number.NaN, status: 'complete' }],
    }),
  ).toThrow();
  expect(() =>
    parseExchange({
      kind: 'exchange',
      startedAt: at,
      time: { timezone: 'UTC', offsetMinutes: 1000 },
    }),
  ).toThrow();
  expect(() =>
    parseMetadata({
      kind: 'contextInput',
      role: 'user',
      position: -1,
      transformation: 'verbatim',
      content: 'Hello',
    }),
  ).toThrow();
});

test('saved conversations are the conversation roots, however recorded, most recently active first', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  await store.commit(
    await prepareChatSubmission(store, { ...submit('first', 'older'), at: '2026-10-01T09:00:00Z' }),
  );
  await store.commit(
    await prepareChatSubmission(store, {
      ...submit('second', 'newer'),
      at: '2026-10-05T09:00:00Z',
    }),
  );
  await store.commit(
    await prepareChatSubmission(store, { ...submit('third', 'older'), at: '2026-10-08T09:00:00Z' }),
  );
  // Recorded by another operation than Send, with its own exchange and message.
  const conversation = {
    kind: 'conversation',
    title: 'Recorded',
    createdAt: '2026-09-01T09:00:00Z',
  };
  const exchange = { kind: 'exchange', startedAt: '2026-09-02T09:00:00Z' };
  const message = { kind: 'message', role: 'user', at: '2026-09-02T09:00:00Z', text: 'Hello' };
  await store.commit(
    request('recorded', [
      create('recorded', conversation),
      { ...create('recorded-exchange', exchange), placement: { parent: 'recorded', order: 'a' } },
      {
        ...create('recorded-message', message),
        placement: { parent: 'recorded-exchange', order: 'a' },
      },
    ]),
  );
  const chats = await savedChats(store);
  expect(chats.map(({ node }) => node)).toEqual(['older', 'newer', 'recorded']);
  expect(chats.map(({ activeAt }) => activeAt)).toEqual([
    '2026-10-08T09:00:00Z',
    '2026-10-05T09:00:00Z',
    '2026-09-02T09:00:00Z',
  ]);
  store.close();
});

test('an unavailable saved conversation reports a selection error instead of an acyclic JSON error', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  expect(await savedChats(store)).toEqual([]);
  await expect(savedMessages(store, 'missing-retained-chat')).rejects.toThrow(
    'Conversation is unavailable',
  );
  store.close();
});

test('conversation lists limit recent results without decoding message bodies', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  await store.commit(
    request(
      'many-chats',
      Array.from({ length: 45 }, (_, index) => {
        const node = `chat-${String(index).padStart(2, '0')}`;
        const activeAt = new Date(Date.parse(at) + index * 60_000).toISOString();
        return [
          create(node, { kind: 'conversation', title: node, createdAt: at }),
          create(`${node}-exchange`, { kind: 'exchange', startedAt: at }, node),
          create(
            `${node}-message`,
            {
              kind: 'message',
              role: 'agent',
              at: activeAt,
              status: 'complete',
              parts: 'Unavailable message body',
            },
            `${node}-exchange`,
          ),
        ];
      }).flat(),
    ),
  );
  const chats = await savedChats(store, { limit: 20 });
  expect(chats.map(({ node }) => node)).toEqual(
    Array.from({ length: 20 }, (_, index) => `chat-${44 - index}`),
  );
  expect(chats[0]?.activeAt).toBe(new Date(Date.parse(at) + 44 * 60_000).toISOString());
  expect(await savedChats(store, { limit: 0 })).toEqual([]);
  await expect(savedMessages(store, 'chat-44')).rejects.toThrow();
  store.close();
});

test('Chat owns its undo policy and protects both deleted and retagged records', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  const submission = await prepareChatSubmission(store, submit());
  await store.commit(submission);
  expect((await store.changes(submission.id)).every(preservesChatRecords)).toBe(false);
  const agent = submission.changes.find((change) => change.data?.role === 'agent')!;
  await store.commit(request('delete-message', [await revise(store, agent.node, null)]));
  expect((await store.changes('delete-message')).every(preservesChatRecords)).toBe(false);
  await store.commit(
    request('retag-user', [
      await revise(store, submission.changes.find((change) => change.data?.role === 'user')!.node, {
        kind: 'paragraph',
        text: 'Changed kind',
      }),
    ]),
  );
  expect((await store.changes('retag-user')).every(preservesChatRecords)).toBe(false);
  await store.commit(
    request('edit-content', [
      await revise(store, 'evidence', { kind: 'paragraph', text: 'Edited' }),
    ]),
  );
  expect((await store.changes('edit-content')).every(preservesChatRecords)).toBe(true);
  store.close();
});
