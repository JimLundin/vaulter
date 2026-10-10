import { expect, test } from 'vitest';
import { renameNote } from './rewrite.ts';
import { appendExchange, logData, type Exchange } from '../../vault/documents/notes/capture.ts';
import { SCHEMA } from '../../vault/documents/notes/schema.fixture.ts';

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

const ex = (at: string, more: Partial<Exchange> = {}): Exchange => ({
  at,
  source: 'vault-app',
  procedure: 'capture',
  summary: 'Something about Alpha.',
  topics: ['Alpha'],
  ...more,
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
