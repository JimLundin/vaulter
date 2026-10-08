import { expect, test } from 'vitest';
import { audit, report, type History } from './audit.ts';
import { loadNotes } from '../notes/model/note.ts';
import { parseSchema } from '../notes/model/schema.ts';
import { load } from 'js-yaml';
import { SCHEMA_YAML } from '../notes/model/schema.fixture.ts';

const words = (n: number, w = 'word') => new Array(n).fill(w).join(' ');
const note = (front: string, body: string) => `---\n${front}\n---\n${body}\n`;
const FILES = Object.entries({
  'Home.md': note('type: moc\ntags: []', '# Home'),
  'Alpha.md': note(
    'type: topic\ntags: [area/craft, programming, status/active]\ncreated: 2026-01-01\nopen: ["Which one?"]\nfollow-ups:\n  - {what: Call back, by: 2026-09-30}\n  - {what: Plan it, by: 2026-12}',
    '# Alpha\n\nWorks with Beta Project daily.',
  ),
  'Beta Project.md': note(
    'type: project\ntags: [area/craft, programming]\ncreated: 2026-09-01',
    `# Beta Project\n\n${words(700)}\n\n### 2026-09-28\n\n${words(1600)}`,
  ),
  'Cafe.md': note('type: place\ntags: [area/life]', `# Cafe\n\n${words(80)}`),
  'daily/2026-10-01.md': note('type: daily', '- Coffee at [Cafe](</Cafe.md>).'),
  'daily/2026-09-01.md': note('type: daily', '- Old day.'),
}).map(([path, text]) => ({ path, text }));

const SCHEMA = parseSchema(load(SCHEMA_YAML));
const run = async (h: Partial<History> = {}) =>
  audit(
    loadNotes(FILES),
    SCHEMA,
    { changed: new Set(['Alpha.md']), before: async () => null, ...h },
    '2026-10-03',
    '2026-09-25',
    '8 days ago',
  );
const rows = (s: Awaited<ReturnType<typeof run>>, title: string) =>
  s.find((x) => x.title.startsWith(title))!.rows;

test('the sections that need judgement, from the notes and the week', async () => {
  const s = await run();
  expect(rows(s, 'Changed since 8 days ago')).toEqual([
    'Alpha.md  [area/craft, programming, status/active]',
  ]);
  expect(rows(s, 'Active but untouched')).toEqual(['Alpha.md  (last 2026-01-01)']);
  expect(rows(s, 'Follow-ups due')).toEqual(['Alpha.md: Call back (by 2026-09-30)']);
  expect(rows(s, 'Follow-ups not yet due')).toEqual(['Alpha.md: Plan it (by 2026-12)']);
  expect(rows(s, 'Open questions')).toEqual(['Alpha.md: Which one?']);
  expect(rows(s, 'Possible unlinked mentions')).toEqual([
    'Alpha.md: mentions "Beta Project" → link [Beta Project](</Beta Project.md>)',
  ]);
  expect(rows(s, 'Thin notes')).toEqual(['Alpha.md']);
  expect(rows(s, 'Places without geo')).toEqual(['Cafe.md']);
  expect(rows(s, 'Daily notes since')).toEqual([
    'daily/2026-10-01.md: no where: (bullets link Cafe)',
  ]);
  expect(rows(s, 'Long logs')).toEqual(['Beta Project.md  (1602 words of log)']);
  expect(report(s)).toContain(
    '\n## Open questions — pick the few that matter most to ask Jim (1)\n- Alpha.md: Which one?\n',
  );
});

test('a long log is listed only in the week it crosses the limit, and its old text is read only for candidates', async () => {
  const asked: string[] = [];
  const s = await run({
    before: (p) => {
      asked.push(p);
      return Promise.resolve(FILES.find((f) => f.path === p)!.text);
    },
  });
  expect(rows(s, 'Long logs')).toEqual([]);
  expect(asked).toEqual(['Beta Project.md']);
});
