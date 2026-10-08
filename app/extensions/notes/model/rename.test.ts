import { expect, test } from 'vitest';
import { renameNote } from './rename.ts';
import { applyChanges, type VaultFile } from '../../../core/files.ts';
import { checkVault } from '../../check.ts';
import { SCHEMA_PATH } from './note.ts';
import { SCHEMA_YAML } from './schema.fixture.ts';

const FRONT = (extra = '') =>
  `---\ntype: person\naliases: []\ntags: [area/life, circle/family]\ncreated: 2026-10-03\nsummary: "A note."\n${extra}---\n`;
const NOTE = (title: string, body = '', extra = '') =>
  `${FRONT(extra)}# ${title}\n\n${body}\n\n## Care\n\n## See also\n`;
const FILES: VaultFile[] = [
  {
    path: 'Ada.md',
    text: NOTE('Ada', 'Me: [Ada](</Ada.md#care>).', 'relations:\n  lives-in: [Riverton]\n'),
  },
  {
    path: 'Riverton.md',
    text: NOTE(
      'Riverton',
      '[Ada](</Ada.md>) and [care](</Ada.md#care>).',
      'relations:\n  related-to: [Ada, "Ada", Adalind]\ndates:\n  - {date: "2026-07-26", what: "Ada", where: Ada}\nfollow-ups:\n  - {what: "Vet", who: Ada}\ndecisions:\n  - {date: "2026-09-01", what: "Walks", who: \'Ada\'}\n',
    ),
  },
  { path: 'Adalind.md', text: NOTE('Adalind', '', 'relations:\n  friend-of:\n    - Ada\n') },
  {
    path: 'daily/2026-10-03.md',
    text: '---\nwhere: [Ada, Riverton]\n---\n# 2026-10-03\n\n- Walked [Ada](</Ada.md>).\n',
  },
  {
    path: 'captures/2026-10-03.md',
    text: '---\ntype: capture\ndate: 2026-10-03\nexchanges:\n  - at: "2026-10-03T08:12:40+02:00"\n    source: claude-code\n    procedure: capture\n    summary: A walk.\n    topics: [Ada, Riverton]\n---\n\n## 08:12\n\n**Jim:** Walked [Ada](</Ada.md>).\n',
  },
  { path: 'site/README.md', text: '[Ada](</Ada.md>)' },
  { path: SCHEMA_PATH, text: SCHEMA_YAML },
];
const byPath = (cs: { path: string; text: string | null }[]) =>
  Object.fromEntries(cs.map((c) => [c.path, c.text]));

test('a rename moves the file and rewrites links, anchors and id fields', () => {
  const c = byPath(renameNote(FILES, 'Ada.md', 'Ada Lovelace.md'));
  expect(Object.keys(c).sort((a, b) => (a < b ? -1 : 1))).toEqual([
    'Ada Lovelace.md',
    'Ada.md',
    'Adalind.md',
    'Riverton.md',
    'captures/2026-10-03.md',
    'daily/2026-10-03.md',
  ]);
  expect(c['Ada.md']).toBeNull();
  expect(c['Ada Lovelace.md']).toContain('[Ada](</Ada Lovelace.md#care>)');
  const u = c['Riverton.md']!;
  expect(u).toContain('[Ada](</Ada Lovelace.md>) and [care](</Ada Lovelace.md#care>).');
  expect(u).toContain('related-to: [Ada Lovelace, "Ada Lovelace", Adalind]');
  expect(u).toContain('{date: "2026-07-26", what: "Ada", where: Ada Lovelace}'); // `what` is text, not an id
  expect(u).toContain('{what: "Vet", who: Ada Lovelace}');
  expect(u).toContain("who: 'Ada Lovelace'}");
  expect(c['Adalind.md']).toContain('    - Ada Lovelace\n');
  expect(c['daily/2026-10-03.md']).toContain('where: [Ada Lovelace, Riverton]');
  expect(c['daily/2026-10-03.md']).toContain('(</Ada Lovelace.md>)');
  // Captures: the body is verbatim; the topics follow, or the check would fail them.
  expect(c['captures/2026-10-03.md']).toBe(
    FILES[4].text.replace('topics: [Ada,', 'topics: [Ada Lovelace,'),
  );
});

test('the check finds no problem the rename adds', () => {
  expect(checkVault(FILES).problems).toEqual([]);
  expect(
    checkVault(applyChanges(FILES, renameNote(FILES, 'Ada.md', 'Ada Lovelace.md'))).problems,
  ).toEqual([]);
});

test('a name that YAML would read differently is quoted', () => {
  const c = byPath(renameNote(FILES, 'Ada.md', 'Ada: the cat.md'));
  expect(c['Riverton.md']).toContain('related-to: ["Ada: the cat", "Ada: the cat", Adalind]');
});

test('refuses a missing source, a non-vault or taken target', () => {
  expect(() => renameNote(FILES, 'Nobody.md', 'X.md')).toThrow(/no such file/);
  expect(() => renameNote(FILES, 'Ada.md', 'site/Ada.md')).toThrow(/isn't a vault page/);
  expect(() => renameNote(FILES, 'Ada.md', 'daily/Ada.mdx')).toThrow(/isn't a vault page/);
  expect(() => renameNote(FILES, 'Ada.md', 'Riverton.md')).toThrow(/Riverton.md exists/);
  expect(() => renameNote(FILES, 'Ada.md', 'Ada.md')).toThrow(/already/);
});
