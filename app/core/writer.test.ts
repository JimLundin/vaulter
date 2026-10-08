import { expect, test } from 'vitest';
import { memoryBackend } from '../backends/memory.ts';
import { CheckFailed, Conflict, type Head } from './backend.ts';
import { writerCore } from './writer.ts';
import { fileRules } from './extension.ts';
import { noteFiles } from '../extensions/notes/model/problems.ts';
import { graphFiles } from '../extensions/graph/model/problems.ts';

const RULES = fileRules([
  { id: 'notes', files: noteFiles },
  { id: 'graph', files: graphFiles },
]);
import { SCHEMA } from '../extensions/notes/model/schema.fixture.ts';

const NOTE = (title: string, extra = '') =>
  `---\ntype: topic\naliases: []\ntags: [area/craft, programming]\ncreated: 2026-10-03\nsummary: "${title}."\n---\n# ${title}\n\n${extra}\n\n## See also\n`;

async function setup() {
  const m = memoryBackend({
    ...SCHEMA,
    'Alpha.md': NOTE('Alpha'),
    'Beta.md': NOTE('Beta', 'See [Alpha](</Alpha.md>).'),
  });
  let head = (await m.backend.refresh())!;
  const w = writerCore(
    m.backend,
    RULES,
    () => head.files,
    (h: Head) => {
      head = h;
    },
  );
  return { ...m, w };
}

test('staging, then one commit for every staged file; the overlay is kept by the backend', async () => {
  const { w, backend, files } = await setup();
  await w.stage('Gamma.md', NOTE('Gamma', 'From [Alpha](</Alpha.md>).'));
  await w.stage('Alpha.md', NOTE('Alpha', 'See [Gamma](</Gamma.md>).'));
  expect(Object.keys((await backend.keep.get<any>('overlay')).files)).toEqual([
    'Gamma.md',
    'Alpha.md',
  ]);
  await w.commit!('vaulter: Gamma');
  expect(files().find((f) => f.path === 'Gamma.md')?.text).toContain('# Gamma');
  expect((await backend.history!()).length).toBe(1);
  expect(w.overlay).toBeNull();
});

test('staging the original text again unstages it', async () => {
  const { w } = await setup();
  await w.stage('Alpha.md', NOTE('Alpha', 'x'));
  await w.stage('Alpha.md', NOTE('Alpha'));
  expect(w.overlay).toBeNull();
});

test('staging is refused for a path that is not a vault file, or deleting a file that does not exist', async () => {
  const { w } = await setup();
  await expect(w.stage('notes/Gamma.md', NOTE('Gamma'))).rejects.toThrow(
    /isn't a file the app keeps/,
  );
  await expect(w.stage('Nobody.md', null)).rejects.toThrow(/no such file: Nobody.md/);
  expect(w.overlay).toBeNull();
  // A new file staged, then deleted: unstaged.
  await w.stage('Gamma.md', NOTE('Gamma'));
  await w.stage('Gamma.md', null);
  expect(w.overlay).toBeNull();
});

test('a commit with nothing staged is refused', async () => {
  const { w } = await setup();
  await expect(w.commit!('empty')).rejects.toThrow('nothing is staged');
});

test('a commit that adds a problem is refused; nothing is written', async () => {
  const { w, backend } = await setup();
  await w.stage('Alpha.md', NOTE('Alpha', 'See [Nobody](</Nobody.md>).'));
  await expect(w.commit!('broken')).rejects.toThrow(CheckFailed);
  expect(await backend.history!()).toEqual([]);
});

test('a file changed on the vault since it was staged is a conflict, for any backend', async () => {
  const m = memoryBackend({ 'Alpha.md': NOTE('Alpha') });
  let head = (await m.backend.refresh())!;
  const w = writerCore(
    m.backend,
    RULES,
    () => head.files,
    (h) => {
      head = h;
    },
  );
  await w.stage('Alpha.md', NOTE('Alpha', 'mine'));
  m.push({ 'Alpha.md': NOTE('Alpha', 'theirs') });
  head = (await m.backend.refresh())!;
  await expect(w.commit!('mine')).rejects.toThrow(Conflict);
  expect(m.files()[0].text).toContain('theirs');
});

test('revert undoes a step as a new step', async () => {
  const { w, files, backend } = await setup();
  await w.stage('Alpha.md', NOTE('Alpha', 'changed'));
  const sha = await w.commit!('change');
  await w.revert!(sha);
  expect(files().find((f) => f.path === 'Alpha.md')?.text).toBe(NOTE('Alpha'));
  expect((await backend.history!())[0].message).toMatch(/^Revert "change"/);
});
