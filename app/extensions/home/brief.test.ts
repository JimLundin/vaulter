import { expect, test } from 'vitest';
import { computeBrief } from './brief.ts';
import { deriveGraph } from '../graph/model/graph.ts';
import { loadNotes } from '../notes/model/note.ts';
import { schemaOf } from '../notes/model/schema.ts';
import { SCHEMA } from '../notes/model/schema.fixture.ts';

const note = (name: string, fm: string, body = '') => ({
  path: `${name}.md`,
  text: `---\ntype: topic\naliases: []\ntags: [area/craft]\ncreated: 2026-01-01\nsummary: "${name}."\n${fm}---\n# ${name}\n${body}`,
});
const files = [
  { path: Object.keys(SCHEMA)[0], text: Object.values(SCHEMA)[0] },
  note(
    'Party',
    'dates:\n  - {date: "2020-10-05", what: Birthday, repeat: yearly}\n  - {date: "2026-10-01", end: "2026-10-04", what: Trip}\n',
  ),
  note(
    'Gym',
    'follow-ups:\n  - {what: Renew, by: "2026-10-04"}\n  - {what: Pay, by: "2026-10-02"}\n',
  ),
  note('Ask', 'open: [Why?]\n'),
  {
    path: 'daily/2026-09-26.md',
    text: '---\nwhere: []\n---\n# 2026-09-26\n\n- Did a thing. Raw: captures/x.md\n',
  },
];

test('today, the week, follow-ups due first, and a week back', () => {
  const v = deriveGraph(loadNotes(files), schemaOf(files));
  const b = computeBrief(v, '2026-10-03');
  expect(b.on.map((x) => x.what)).toEqual(['Trip']);
  expect(b.soon.map((x) => [x.what, x.date])).toEqual([['Birthday', '2026-10-05']]);
  expect(b.fus.map((f) => [f.what, f.due, f.late])).toEqual([
    ['Pay', true, true],
    ['Renew', false, false],
  ]);
  expect(b.back).toEqual([
    { label: 'A week ago', note: v.byId.get('daily/2026-09-26'), text: 'Did a thing.' },
  ]);
  expect(b.question).toBeNull(); // the note with a question is neither active nor in the log
});
