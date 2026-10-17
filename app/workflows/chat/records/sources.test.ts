import { expect, test } from 'vitest';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import { create, request, revise } from '@/vault/nodes/fixtures.test-support.ts';
import type { NodeVersion } from '@/vault/nodes/model.ts';
import type { NodeSnapshot } from '@/vault/nodes/store.ts';
import { describeSource } from '@/vault/sources.ts';
import { chatSources } from './sources.ts';

test('retained summaries expose exact text as source evidence without a speaker', async () => {
  const nodes = memoryNodeBackend();
  const at = '2026-06-05T00:00:00+02:00';
  const text = 'Kept **studio time** free.\n';
  await nodes.commit(
    request('summary', [
      create('user', { kind: 'actor' }),
      create('daily', { kind: 'conversation', title: 'Studio time', createdAt: at }),
      create('day', { kind: 'exchange', startedAt: at }, 'daily'),
      create(
        'record',
        {
          kind: 'message',
          role: 'record',
          at,
          atPrecision: 'day',
          text,
          record: { kind: 'summary', label: 'Daily summary' },
        },
        'day',
      ),
    ]),
  );
  const view = await nodes.snapshot();
  const reader = chatSources((node) => `#/chat/${node}/`);
  expect(reader.text(view.get('record')!, { view, textOf: () => '' })).toBe(text);
  expect(reader.describe(view.get('record')!, view)).toMatchObject({
    title: 'Studio time',
    href: '#/chat/daily/',
    date: at,
    speaker: undefined,
    capture: true,
  });
  nodes.close();
});

test('Chat source offsets concatenate only message prose and retain capture framing', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('conversation', { kind: 'conversation', title: 'Planning' }),
      create('exchange', { kind: 'exchange', preamble: 'Imported framing.' }, 'conversation'),
      {
        ...create('question', { kind: 'message', text: 'First question.' }, 'exchange'),
        placement: { parent: 'exchange', order: 'a' },
      },
      {
        ...create(
          'answer',
          {
            kind: 'message',
            parts: [
              { kind: 'text', text: 'Keep ' },
              { kind: 'tool', text: 'hidden text', output: 'hidden output' },
              { kind: 'text', text: 'mornings 🪴 free.' },
            ],
          },
          'exchange',
        ),
        placement: { parent: 'exchange', order: 'b' },
      },
      create('reference', { kind: 'reference', text: 'Reference is not prose.' }, 'exchange'),
      create(
        'metadata',
        { kind: 'metadataReference', content: 'Metadata is not prose.' },
        'exchange',
      ),
      create(
        'empty',
        { kind: 'message', parts: [{ kind: 'tool', output: 'No prose.' }] },
        'exchange',
      ),
      {
        ...create('later', { kind: 'exchange', preamble: '' }, 'conversation'),
        placement: { parent: 'conversation', order: 'b' },
      },
      create('later-message', { kind: 'message', text: 'Next exchange.' }, 'later'),
    ]),
  );
  const view = await nodes.snapshot();
  const reader = chatSources();
  const textOf = (node: NodeVersion): string => reader.text(node, { view, textOf }) ?? '';
  expect(textOf(view.get('answer')!)).toBe('Keep mornings 🪴 free.');
  expect(reader.exactText?.(view.get('answer')!, view)).toBe('Keep mornings 🪴 free.');
  expect(reader.exactText?.(view.get('empty')!, view)).toBe('');
  expect(reader.exactText?.(view.get('exchange')!, view)).toBeUndefined();
  expect(reader.exactText?.(view.get('reference')!, view)).toBeUndefined();
  expect(textOf(view.get('exchange')!)).toBe(
    'Imported framing.\nFirst question.\nKeep mornings 🪴 free.',
  );
  expect(textOf(view.get('conversation')!)).toBe(
    'Imported framing.\nFirst question.\nKeep mornings 🪴 free.\nNext exchange.',
  );
  expect(textOf(view.get('reference')!)).toBe('');
  expect(textOf(view.get('metadata')!)).toBe('');
  nodes.close();
});

test('Chat delegates retained child text and describes its source at the selected snapshot', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('conversation', { kind: 'conversation', title: 'Original planning' }),
      create('exchange', { kind: 'exchange', startedAt: '2026-10-01T10:00:00Z' }, 'conversation'),
      create('paragraph', { kind: 'paragraph' }, 'exchange'),
      create(
        'message',
        { kind: 'message', role: 'agent', at: '2026-10-01T10:02:00Z', parts: [] },
        'exchange',
      ),
      create('message-paragraph', { kind: 'paragraph' }, 'message'),
      create('retained-message', { kind: 'message' }, 'exchange'),
      create('retained-words', { kind: 'paragraph' }, 'retained-message'),
      create('other', { kind: 'conversation', title: 'Later planning' }),
    ]),
  );
  const original = await nodes.snapshot();
  await nodes.commit(
    request('moved', [
      await revise(nodes, 'conversation', { kind: 'conversation', title: 'Renamed planning' }),
      {
        ...(await revise(nodes, 'paragraph', { kind: 'paragraph' })),
        placement: { parent: 'other', order: 'a' },
      },
    ]),
  );
  const current = await nodes.snapshot();
  const reader = chatSources((node) => `#/chat/${node}/`);
  expect(
    reader.text(original.get('exchange')!, {
      view: original,
      textOf: (node) => (node.key.node === 'paragraph' ? 'Owner-supplied paragraph text.' : ''),
    }),
  ).toBe('Owner-supplied paragraph text.');
  expect(
    reader.text(original.get('retained-message')!, {
      view: original,
      textOf: () => 'Retained nested prose.',
    }),
  ).toBe('Retained nested prose.');
  expect(describeSource(original.get('paragraph')!, original, [reader])).toEqual({
    title: 'Original planning',
    href: '#/chat/conversation/',
    date: '2026-10-01T10:00:00Z',
    speaker: undefined,
    capture: false,
  });
  expect(describeSource(current.get('paragraph')!, current, [reader])).toMatchObject({
    title: 'Later planning',
    href: '#/chat/other/',
    capture: false,
  });
  expect(describeSource(original.get('message-paragraph')!, original, [reader])).toMatchObject({
    title: 'Original planning',
    date: '2026-10-01T10:02:00Z',
    speaker: 'agent',
    capture: false,
  });
  expect(reader.describe(original.get('exchange')!, original)?.capture).toBe(true);
  expect(reader.describe(original.get('message')!, original)?.capture).toBe(true);
  expect(reader.describe(original.get('conversation')!, original)?.capture).toBe(false);
  nodes.close();
});

test('Chat owns known metadata containers but does not guess another module payload', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('interpretation', {
        kind: 'interpretation',
        statement: 'Not projected by the retained format.',
      }),
      create('child', { kind: 'paragraph' }, 'interpretation'),
      create('foreign', {
        kind: 'foreign',
        text: 'Unclaimed text',
        content: 'Unclaimed content',
        parts: [{ kind: 'text', text: 'Unclaimed parts' }],
      }),
    ]),
  );
  const view = await nodes.snapshot();
  const reader = chatSources();
  expect(reader.text(view.get('interpretation')!, { view, textOf: () => 'Retained child.' })).toBe(
    'Retained child.',
  );
  expect(
    reader.text(view.get('foreign')!, { view, textOf: () => 'Should not traverse' }),
  ).toBeUndefined();
  expect(reader.describe(view.get('foreign')!, view)).toBeUndefined();
  expect(reader.exactText?.(view.get('foreign')!, view)).toBeUndefined();
  nodes.close();
});

test('source description terminates when malformed retained ancestry loops', () => {
  const conversation: NodeVersion = {
    key: { node: 'chat', transaction: 'original' },
    data: { kind: 'conversation', title: 'Retained title' },
    placement: { parent: 'paragraph', order: 'a' },
    connection: null,
  };
  const paragraph: NodeVersion = {
    key: { node: 'paragraph', transaction: 'original' },
    data: { kind: 'paragraph' },
    placement: { parent: 'chat', order: 'a' },
    connection: null,
  };
  const view: NodeSnapshot = {
    sequence: 1,
    get: (node) => (node === 'chat' ? conversation : paragraph),
    resolve: () => undefined,
    children: () => [],
    roots: () => [],
  };
  expect(describeSource(paragraph, view, [chatSources()])?.title).toBe('Retained title');
});

test('Chat describes only its own source records and retains their direct historical attribution', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('conversation', { kind: 'conversation', title: 'Planning' }),
      create('exchange', { kind: 'exchange', startedAt: '2026-10-01T10:00:00Z' }, 'conversation'),
      create('interpretation', { kind: 'interpretation', at: '2026-10-02T10:00:00Z' }, 'exchange'),
      create(
        'resource',
        { kind: 'resource', title: 'Reference', url: 'https://example.com' },
        'exchange',
      ),
      create(
        'content',
        { kind: 'content', title: 'Report', text: 'Independent report.' },
        'exchange',
      ),
      create('agentRun', { kind: 'agentRun' }, 'exchange'),
    ]),
  );
  const view = await nodes.snapshot();
  const reader = chatSources((node) => `#/chat/${node}/`);
  for (const node of ['resource', 'content', 'agentRun'])
    expect(reader.describe(view.get(node)!, view)).toBeUndefined();
  expect(reader.describe(view.get('interpretation')!, view)).toMatchObject({
    title: 'Planning',
    href: '#/chat/conversation/',
    date: '2026-10-02T10:00:00Z',
    capture: false,
  });
  nodes.close();
});
