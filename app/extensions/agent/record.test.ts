import { expect, test } from 'vitest';
import { logData } from '../notes/model/capture.ts';
import { recordExchange, type ChatTurn } from './record.ts';

const turns: ChatTurn[] = [
  { role: 'user', at: '2026-10-03T06:12:40Z', text: 'vault it: Alpha   moved, uh, to Beta.' },
  {
    role: 'agent',
    at: '2026-10-03T06:12:41Z',
    text: 'Filing it.',
    tools: ['search', 'writeFile'],
    tokens: { in: 1000, out: 50 },
    model: 'gpt-6-astra-2026-09',
  },
  {
    role: 'agent',
    at: '2026-10-03T06:13:00Z',
    text: '',
    tools: ['capture'],
    tokens: { in: 1200, out: 20 },
  },
];

test('the record is what was said, verbatim, with the collected groups and the session', () => {
  const r = recordExchange({
    turns,
    judged: {
      procedure: 'capture',
      summary: ' Alpha moved to Beta. ',
      topics: ['Alpha', 'Beta', 'Alpha'],
      where: ['Beta'],
    },
    collected: {
      groups: { device: { id: '3f9c', form: 'phone' }, weather: undefined },
      where: ['Uppsala'],
    },
    session: { chat: '8b21', model: 'gpt-6-astra', app: 'c2b7cb7' },
    files: [],
    now: new Date('2026-10-03T06:14:00Z'),
  });
  expect(r.path).toBe('captures/2026-10-03.md');
  expect(r.exchange).toEqual({
    at: '2026-10-03T08:12:40+02:00',
    ended: '2026-10-03T08:14:00+02:00',
    source: 'vault-app',
    procedure: 'capture',
    summary: 'Alpha moved to Beta.',
    topics: ['Alpha', 'Beta'],
    where: ['Uppsala', 'Beta'],
    device: { id: '3f9c', form: 'phone' },
    weather: undefined,
    session: {
      chat: '8b21',
      model: 'gpt-6-astra',
      app: 'c2b7cb7',
      turns: 2,
      served_by: 'gpt-6-astra-2026-09',
      tools: ['search', 'writeFile', 'capture'],
      tokens: { in: 2200, out: 70 },
    },
  });
  expect(r.text).toContain(
    '## 08:12\n\n**Jim:** vault it: Alpha   moved, uh, to Beta.\n\n**Agent:** Filing it.\n',
  );
  expect(logData(r.text)?.exchanges[0].weather).toBeUndefined();
});

test('a second capture the same day appends to the log', () => {
  const first = recordExchange({
    turns,
    judged: { procedure: 'capture', summary: 'One.', topics: [] },
    collected: { groups: {} },
    session: {},
    files: [],
  });
  const second = recordExchange({
    turns: [{ role: 'user', at: '2026-10-03T16:40:00Z', text: 'sign-off: a quiet day.' }],
    judged: { procedure: 'sign-off', summary: 'Quiet.', topics: [] },
    collected: { groups: {} },
    session: {},
    files: [{ path: first.path, text: first.text }],
  });
  expect(logData(second.text)?.exchanges.map((e: { procedure: string }) => e.procedure)).toEqual([
    'capture',
    'sign-off',
  ]);
  expect(second.text.indexOf('## 08:12')).toBeLessThan(second.text.indexOf('## 18:40'));
});

test('nothing Jim said is nothing to record', () => {
  expect(() =>
    recordExchange({
      turns: [{ role: 'agent', at: '2026-10-03T06:00:00Z', text: 'Hello?' }],
      judged: { procedure: 'capture', summary: 'x', topics: [] },
      collected: { groups: {} },
      session: {},
      files: [],
    }),
  ).toThrow(/nothing Jim said/);
});
