import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../nodes/memory.ts';
import { create, request, seed, revise } from '../nodes/fixtures.test-support.ts';
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
import { chatOperations } from './chat.ts';
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
    [parseChatReference, { kind: 'reference', role: 'topic' }],
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

test('saved conversations are paginated and deduplicated across more than one history page', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  // Each subsequent page includes a different conversation as well as repeat submissions.
  for (let index = 0; index < 102; index++) {
    // biome-ignore lint/performance/noAwaitInLoops: acceptance order is the behavior being exercised.
    const submission = await prepareChatSubmission(
      store,
      submit(`send-${index}`, index === 0 ? 'oldest' : 'latest'),
    );
    await store.commit(submission);
  }
  expect((await savedChats(store)).map(({ node }) => node)).toEqual(['latest', 'oldest']);
  store.close();
});
