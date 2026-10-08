import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { fakeGitHub } from './fake-github.ts';
import { closeDb, newCacheKey } from '../../core/store.ts';
import { forget } from '../../core/unlock.ts';
import { CheckFailed, Conflict, TRAILER } from '../../core/backend.ts';
import { gate } from '../../core/writer.ts';
import { fileRules } from '../../core/extension.ts';
import { noteFiles } from '../../extensions/notes/model/problems.ts';
import { readCache } from './sync.ts';
import { githubBackend } from './index.ts';
import { SCHEMA } from '../../extensions/notes/model/schema.fixture.ts';

const verify = gate(fileRules([{ id: 'notes', files: noteFiles }]));

const NOTE = (title: string, extra = '') =>
  `---\ntype: topic\naliases: []\ntags: [area/craft, programming]\ncreated: 2026-10-03\nsummary: "${title}."\n---\n# ${title}\n\n${extra}\n\n## See also\n`;
const VAULT = {
  ...SCHEMA,
  'Home.md':
    '---\ntype: moc\naliases: []\ntags: []\ncreated: 2026-01-01\nsummary: "Home."\n---\n# Home\n',
  'Alpha.md': NOTE('Alpha'),
  'Beta.md': NOTE('Beta', 'See [Alpha](</Alpha.md>).'),
};

let key: CryptoKey;
beforeEach(async () => {
  key = await newCacheKey();
});
afterEach(async () => {
  await forget();
  await closeDb();
});

async function setup() {
  const f = await fakeGitHub(VAULT);
  const backend = githubBackend({ token: 'tok', key, api: 'https://gh.test', fetch: f.fetchFn });
  await backend.refresh();
  return { ...f, backend };
}

test('several files are one commit on main, cached at once', async () => {
  const { backend, state, filesAt } = await setup();
  const r = await backend.write!(
    [
      { path: 'Gamma.md', text: NOTE('Gamma', 'From [Alpha](</Alpha.md>).') },
      { path: 'Alpha.md', text: NOTE('Alpha', 'See [Gamma](</Gamma.md>).') },
    ],
    'vaulter: Gamma',
    verify,
  );
  expect(filesAt()['Gamma.md']).toContain('# Gamma');
  expect(state.calls.filter((c) => c.startsWith('PATCH'))).toHaveLength(1);
  expect((await readCache(key))!.snapshot.commit).toBe(r.commit);
  expect((await backend.history!())[0].message).toContain(TRAILER);
});

test('a write the check refuses writes nothing', async () => {
  const { backend, state } = await setup();
  const before = state.main;
  await expect(
    backend.write!(
      [{ path: 'Alpha.md', text: NOTE('Alpha', 'See [Nobody](</Nobody.md>).') }],
      'broken',
      verify,
    ),
  ).rejects.toThrow(CheckFailed);
  expect(state.main).toBe(before);
});

test('main moved elsewhere: rebuilt on it when other files changed', async () => {
  const { backend, push, filesAt } = await setup();
  await push({ 'Beta.md': NOTE('Beta', 'See [Alpha](</Alpha.md>), edited elsewhere.') });
  await backend.write!([{ path: 'Alpha.md', text: NOTE('Alpha', 'mine') }], 'mine', verify);
  expect(filesAt()['Alpha.md']).toContain('mine');
  expect(filesAt()['Beta.md']).toContain('edited elsewhere');
});

test('main moved elsewhere on the same file: a conflict, nothing written', async () => {
  const { backend, state, push } = await setup();
  await push({ 'Alpha.md': NOTE('Alpha', 'theirs') });
  const theirs = state.main;
  await expect(
    backend.write!([{ path: 'Alpha.md', text: NOTE('Alpha', 'mine') }], 'mine', verify),
  ).rejects.toThrow(Conflict);
  expect(state.main).toBe(theirs);
});

test('revert undoes a commit as a new one, a new file included; refused once the file changed again', async () => {
  const { backend, filesAt, push } = await setup();
  const done = await backend.write!(
    [
      { path: 'Gamma.md', text: NOTE('Gamma') },
      { path: 'Alpha.md', text: NOTE('Alpha', 'changed') },
    ],
    'add Gamma',
    verify,
  );
  await backend.revert!(done.commit, verify);
  expect(filesAt()['Gamma.md']).toBeUndefined();
  expect(filesAt()['Alpha.md']).toBe(VAULT['Alpha.md']);
  expect((await backend.history!())[0].message).toMatch(/^Revert "add Gamma"/);
  const again = await backend.write!(
    [{ path: 'Alpha.md', text: NOTE('Alpha', 'v2') }],
    'v2',
    verify,
  );
  await push({ 'Alpha.md': NOTE('Alpha', 'v3') });
  await backend.refresh();
  await expect(backend.revert!(again.commit, verify)).rejects.toThrow(Conflict);
});
