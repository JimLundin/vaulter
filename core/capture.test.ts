import { expect, test } from 'vitest';
import {
  anchorOf,
  appendExchange,
  dayTotals,
  headingsFor,
  logData,
  stockholmStamp,
  type Exchange,
} from './capture.ts';
import { checkVault } from './check.ts';
import { renameNote } from './rename.ts';
import { SCHEMA } from './schema.fixture.ts';

const NOTE = (title: string) =>
  `---\ntype: topic\naliases: []\ntags: [area/craft, programming]\ncreated: 2026-10-03\nsummary: "${title}."\n---\n# ${title}\n\n## See also\n`;
const VAULT = {
  ...SCHEMA,
  'Home.md':
    '---\ntype: moc\naliases: []\ntags: []\ncreated: 2026-01-01\nsummary: "Home."\n---\n# Home\n',
  'Alpha.md': NOTE('Alpha'),
  'Beta.md': NOTE('Beta'),
};
const files = (extra: Record<string, string>) =>
  Object.entries({ ...VAULT, ...extra }).map(([path, text]) => ({ path, text }));
const problems = (extra: Record<string, string>) => checkVault(files(extra)).problems;

const ex = (at: string, more: Partial<Exchange> = {}): Exchange => ({
  at,
  source: 'vault-app',
  procedure: 'capture',
  summary: 'Something about Alpha.',
  topics: ['Alpha'],
  ...more,
});

test('stamps are Stockholm time with the offset of the day, summer and winter', () => {
  expect(stockholmStamp(new Date('2026-10-03T06:12:40Z'))).toBe('2026-10-03T08:12:40+02:00');
  expect(stockholmStamp(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-02T00:30:00+01:00');
});

test("a day's log: exchanges appended, the body before kept byte for byte, metadata only where known", () => {
  const first = appendExchange(
    null,
    ex('2026-10-03T08:12:40+02:00', {
      device: { id: '3f9c', form: 'phone', os: 'Android', model: undefined },
      context: {},
      where: ['Uppsala'],
    }),
    [
      { who: 'Jim', text: 'Alpha is   moving.  ' },
      { who: 'Agent', text: 'Filed.' },
    ],
  );
  expect(first).toBe(
    '---\ntype: capture\ndate: "2026-10-03"\nexchanges:\n  - at: "2026-10-03T08:12:40+02:00"\n    source: vault-app\n    procedure: capture\n    summary: Something about Alpha.\n    topics: [Alpha]\n    device: {id: 3f9c, form: phone, os: Android}\n    where: [Uppsala]\n---\n\n## 08:12\n\n**Jim:** Alpha is   moving.\n\n**Agent:** Filed.\n',
  );
  const second = appendExchange(
    first,
    ex('2026-10-03T08:12:59+02:00', { source: 'claude-code', topics: ['Beta'] }),
    [{ who: 'Jim', text: 'And Beta.' }],
  );
  expect(second.slice(second.indexOf('## 08:12\n'))).toBe(
    '## 08:12\n\n**Jim:** Alpha is   moving.\n\n**Agent:** Filed.\n\n## 08:12:59\n\n**Jim:** And Beta.\n',
  );
  expect(logData(second)?.exchanges.map((e: Exchange) => e.at)).toEqual([
    '2026-10-03T08:12:40+02:00',
    '2026-10-03T08:12:59+02:00',
  ]);
  expect(problems({ 'captures/2026-10-03.md': second })).toEqual([]);
  expect(dayTotals(logData(second)!.exchanges)).toEqual({
    sources: ['vault-app', 'claude-code'],
    devices: ['3f9c'],
    procedures: ['capture'],
    topics: ['Alpha', 'Beta'],
    where: ['Uppsala'],
  });
});

test('an exchange never goes before the last one', () => {
  const log = appendExchange(null, ex('2026-10-03T09:00:00+02:00'), [{ who: 'Jim', text: 'x' }]);
  expect(() =>
    appendExchange(log, ex('2026-10-03T08:00:00+02:00'), [{ who: 'Jim', text: 'y' }]),
  ).toThrow(/would come before/);
});

test('headings and anchors: the minute, or the second when the minute is taken', () => {
  const h = headingsFor([
    '2026-10-03T08:12:40+02:00',
    '2026-10-03T08:12:59+02:00',
    '2026-10-03T18:40:00+02:00',
  ]);
  expect(h).toEqual(['08:12', '08:12:59', '18:40']);
  expect(h.map(anchorOf)).toEqual(['0812', '081259', '1840']);
});

test('a daily raw link to an exchange resolves through its heading anchor', () => {
  const log = appendExchange(null, ex('2026-10-03T08:12:40+02:00'), [{ who: 'Jim', text: 'x' }]);
  const daily = (hash: string) =>
    `---\nwhere: []\n---\n# 2026-10-03\n\n- Alpha. Raw: [captures/2026-10-03#${hash}](</captures/2026-10-03.md#${hash}>)\n`;
  expect(problems({ 'captures/2026-10-03.md': log, 'daily/2026-10-03.md': daily('0812') })).toEqual(
    [],
  );
  expect(problems({ 'captures/2026-10-03.md': log, 'daily/2026-10-03.md': daily('0900') })).toEqual(
    [
      'daily/2026-10-03.md: /captures/2026-10-03.md#0900 → no heading #0900 in captures/2026-10-03.md',
    ],
  );
});

test('the check holds a log to its schema', () => {
  const log = (front: string, body = '## 08:12\n\n**Jim:** x\n') =>
    `---\ntype: capture\ndate: 2026-10-03\nexchanges:\n${front}---\n\n${body}`;
  const one = (fields: string) =>
    log(`  - at: "2026-10-03T08:12:40+02:00"\n    summary: S.\n    topics: [Alpha]\n${fields}`);
  const p = (text: string, path = 'captures/2026-10-03.md') =>
    problems({ [path]: text }).map((x) => x.replace(`${path}: `, ''));

  expect(p(one('    source: vault-app\n    procedure: capture\n'))).toEqual([]);
  expect(p(one('    source: fax\n    procedure: capture\n'))).toEqual([
    `exchange 1: source "fax" is not one of meta/schema.yaml's sources (vault-app, claude-code)`,
  ]);
  expect(p(one('    source: vault-app\n    procedure: capture\n    device: phone\n'))).toEqual([
    'exchange 1: device must be a map of what was collected (fields: at, ended, source, procedure, summary, topics, where, or a group)',
  ]);
  expect(
    p(one('    source: vault-app\n    procedure: capture\n'), 'captures/2026-10-03-walk.md'),
  ).toEqual([
    'unknown frontmatter field "exchanges" (fields: type, date, source, topics, where)',
    'source is required (claude-app, claude-code, scheduled, …)',
    'topics must list the notes this capture was filed into ([] only for a fragment too garbled to file)',
  ]);
  // An unquoted time is a YAML date, not text.
  expect(
    p(
      log(
        '  - at: 2026-10-03T08:12:40+02:00\n    source: vault-app\n    procedure: capture\n    summary: S.\n    topics: []\n',
      ),
    ),
  ).toEqual(['exchange 1: at must be a quoted time with its offset, "2026-10-03T08:12:40+02:00"']);
  expect(
    p(one('    source: vault-app\n    procedure: capture\n').replace('## 08:12', '## 08:13')),
  ).toEqual([
    "the body's exchange headings (## 08:13) must be one per exchange, in order: ## 08:12",
  ]);
  expect(
    p(
      one('    source: vault-app\n    procedure: capture\n    topics: [Gone]\n').replace(
        '    topics: [Alpha]\n',
        '',
      ),
    ),
  ).toEqual([
    'exchange 1: topics → "Gone" is not a note (renamed? use the current filename without extension)',
  ]);
});

test("renaming a note renames it in the exchanges' topics and where, not in the verbatim turns", () => {
  const log = appendExchange(null, ex('2026-10-03T08:12:40+02:00', { where: ['Alpha'] }), [
    { who: 'Jim', text: 'Alpha, as I said it.' },
  ]);
  const c = Object.fromEntries(
    renameNote(files({ 'captures/2026-10-03.md': log }), 'Alpha.md', 'Alpha Prime.md').map((x) => [
      x.path,
      x.text,
    ]),
  );
  const after = c['captures/2026-10-03.md']!;
  expect(logData(after)?.exchanges[0]).toMatchObject({
    topics: ['Alpha Prime'],
    where: ['Alpha Prime'],
  });
  expect(after).toContain('**Jim:** Alpha, as I said it.');
});
