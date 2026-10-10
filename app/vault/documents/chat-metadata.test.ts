import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../nodes/memory.ts';
import { create, request, seed } from '../nodes/fixtures.test-support.ts';
import { recordChatMetadata } from './chat-metadata-store.ts';
import type { InterpretationData, ObservationData } from './chat-metadata.ts';

const observation: ObservationData = {
  kind: 'observation',
  subject: 'location',
  source: { kind: 'browser', name: 'webPlatform', version: '1', method: 'geolocation' },
  time: {
    requested: '2026-10-10T11:15:00Z',
    observed: '2026-10-10T11:12:00Z',
    received: '2026-10-10T11:15:02Z',
    elapsedMs: 2000,
  },
  outcome: {
    status: 'collected',
    value: {
      latitude: 59.8,
      longitude: 17.6,
      accuracyM: 30,
      altitudeM: null,
      altitudeAccuracyM: null,
      speedMps: 0,
      headingDegrees: null,
    },
  },
};

test('late observations and corrections append exact evidence without versioning messages or ancestors', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  await store.commit(
    request('chat', [
      create('conversation', {
        kind: 'conversation',
        title: 'Today',
        createdAt: '2026-10-10T11:15:00Z',
      }),
      create('exchange', { kind: 'exchange', startedAt: '2026-10-10T11:15:00Z' }, 'conversation'),
      create(
        'message',
        {
          kind: 'message',
          role: 'user',
          at: '2026-10-10T11:15:00Z',
          text: 'Yesterday I decided to move studio work.',
        },
        'exchange',
      ),
    ]),
  );
  const before = await store.snapshot();
  const input = {
    transaction: 'observation',
    recordedBy: 'user',
    exchange: 'exchange',
    entries: [
      {
        node: 'location',
        order: 'a',
        data: observation,
        references: [
          {
            node: 'observed-message',
            order: 'a',
            target: before.get('message')!.key,
            data: { kind: 'metadataReference' as const, role: 'subject' as const },
          },
        ],
      },
    ],
  };
  const recorded = await recordChatMetadata(store, input);
  expect(await recordChatMetadata(store, input)).toEqual(recorded);
  const interpretation: InterpretationData = {
    kind: 'interpretation',
    category: 'event',
    at: '2026-10-10T11:15:03Z',
    statement: 'The decision happened on October 9.',
    certainty: 'inferred',
    method: { name: 'dateResolution', version: '1' },
    details: { date: '2026-10-09', timezone: 'Europe/Stockholm' },
  };
  await recordChatMetadata(store, {
    transaction: 'interpretation',
    recordedBy: 'user',
    exchange: 'exchange',
    entries: [
      {
        node: 'interpretation',
        order: 'b',
        data: interpretation,
        references: [
          {
            node: 'evidence-link',
            order: 'a',
            target: before.get('message')!.key,
            data: {
              kind: 'metadataReference',
              role: 'evidence',
              selection: { format: 'text', start: 0, end: 9, unit: 'utf16' },
            },
          },
        ],
      },
    ],
  });
  const first = (await store.snapshot()).get('interpretation')!;
  await recordChatMetadata(store, {
    transaction: 'correction',
    recordedBy: 'user',
    exchange: 'exchange',
    entries: [
      {
        node: 'correction',
        order: 'c',
        data: { ...interpretation, statement: 'I meant October 8.', certainty: 'explicit' },
        references: [
          {
            node: 'correction-evidence',
            order: 'b',
            target: before.get('message')!.key,
            data: { kind: 'metadataReference', role: 'evidence' },
          },
          {
            node: 'corrects',
            order: 'a',
            target: first.key,
            data: { kind: 'metadataReference', role: 'corrects' },
          },
        ],
      },
    ],
  });
  const now = await store.snapshot();
  expect(now.get('message')).toBe(before.get('message'));
  expect(now.get('exchange')).toBe(before.get('exchange'));
  expect(now.get('conversation')).toBe(before.get('conversation'));
  expect(now.resolve(first.key)).toBe(first);
  expect(now.get('location')?.data).toEqual(observation);
  expect((await store.changes('correction')).map((change) => change.node)).toEqual([
    'correction',
    'correction-evidence',
    'corrects',
  ]);
  await expect(recordChatMetadata(store, { ...input, transaction: 'rewrite' })).rejects.toThrow(
    'Conflict',
  );
  store.close();
});

test('invalid measurement units, dates, exact targets, and selection ranges reject atomically', async () => {
  const store = memoryNodeBackend();
  await seed(store);
  const base = { transaction: 'bad', recordedBy: 'user', exchange: 'page' };
  expect(() =>
    recordChatMetadata(store, {
      ...base,
      entries: [
        {
          node: 'bad',
          order: 'a',
          data: { ...observation, time: { ...observation.time, observed: null } },
        },
      ],
    }),
  ).toThrow('observation time');
  expect(() =>
    recordChatMetadata(store, {
      ...base,
      entries: [
        {
          node: 'bad',
          order: 'a',
          data: observation,
          references: [
            {
              node: 'range',
              order: 'a',
              target: { node: 'page', transaction: 'seed' },
              data: {
                kind: 'metadataReference',
                role: 'evidence',
                selection: { format: 'text', start: 9, end: 3, unit: 'utf16' },
              },
            },
          ],
        },
      ],
    }),
  ).toThrow('ends before');
  await expect(
    recordChatMetadata(store, {
      ...base,
      entries: [
        {
          node: 'bad',
          order: 'a',
          data: observation,
          references: [
            {
              node: 'unknown',
              order: 'a',
              target: { node: 'page', transaction: 'nonexistent' },
              data: { kind: 'metadataReference', role: 'subject' },
            },
          ],
        },
      ],
    }),
  ).rejects.toThrow('exact version');
  expect((await store.snapshot()).sequence).toBe(1);
  store.close();
});
