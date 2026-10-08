import { expect, test } from 'vitest';
import { fakeGitHub } from '../../backends/github/fake-github.ts';
import { github } from '../../backends/github/api.ts';
import { TRAILER } from '../../shell/backend.ts';
import { codeRepo } from './repo.ts';

const APP = { owner: 'JimLundin', name: 'vaulter', branch: 'main' };
const SOURCE = {
  'README.md': '# The app\n',
  'app/extensions/index.ts': 'export const EXTENSIONS = [home, notes];\n',
  'app/extensions/home/index.tsx': 'export const home = { id: "home" };\n',
};

async function setup(status?: typeof fetch) {
  const f = await fakeGitHub(SOURCE);
  const gh = github('tok', APP, 'https://gh.test', f.fetchFn);
  return { ...f, gh, repo: codeRepo(gh, APP, 'https://gh.test', status) };
}

test('lists, reads and searches the source, with staged edits applied', async () => {
  const { repo } = await setup();
  expect(await repo.list('app/')).toEqual([
    'app/extensions/home/index.tsx',
    'app/extensions/index.ts',
  ]);
  repo.stage('app/extensions/reading/index.tsx', 'export const reading = { id: "reading" };\n');
  repo.stage('README.md', null);
  expect(await repo.list()).toEqual([
    'app/extensions/home/index.tsx',
    'app/extensions/index.ts',
    'app/extensions/reading/index.tsx',
  ]);
  expect(await repo.read('README.md')).toBeNull();
  expect(await repo.search('ID: "')).toEqual([
    'app/extensions/home/index.tsx:1: export const home = { id: "home" };',
    'app/extensions/reading/index.tsx:1: export const reading = { id: "reading" };',
  ]);
});

test('every staged edit is one commit on main, with the trailer', async () => {
  const { repo, gh, state, filesAt } = await setup();
  repo.stage('app/extensions/reading/index.tsx', 'export const reading = {};\n');
  repo.stage('app/extensions/index.ts', 'export const EXTENSIONS = [home, reading, notes];\n');
  repo.stage('README.md', null);
  const sha = await repo.commit('add a reading list');
  expect(state.main).toBe(sha);
  expect(filesAt()).toEqual({
    'app/extensions/home/index.tsx': SOURCE['app/extensions/home/index.tsx'],
    'app/extensions/index.ts': 'export const EXTENSIONS = [home, reading, notes];\n',
    'app/extensions/reading/index.tsx': 'export const reading = {};\n',
  });
  expect(repo.staged()).toEqual([]);
  expect(await repo.read('app/extensions/reading/index.tsx')).toBe('export const reading = {};\n');
  expect((await gh.commit(sha)).message).toBe(`add a reading list\n\n${TRAILER}`);
});

test('a commit is rebuilt on main when another file moved there', async () => {
  const { repo, push, filesAt } = await setup();
  await repo.read('README.md');
  repo.stage('app/extensions/index.ts', 'export const EXTENSIONS = [];\n');
  await push({ 'README.md': '# The app, elsewhere\n' });
  await repo.commit('empty the list');
  expect(filesAt()['README.md']).toBe('# The app, elsewhere\n');
  expect(filesAt()['app/extensions/index.ts']).toBe('export const EXTENSIONS = [];\n');
});

test('a file changed on main meanwhile is a conflict, and nothing is written', async () => {
  const { repo, push, state } = await setup();
  await repo.read('README.md');
  repo.stage('README.md', '# Mine\n');
  await push({ 'README.md': '# Theirs\n' });
  const before = state.main;
  await expect(repo.commit('mine')).rejects.toThrow(/changed on main meanwhile: README.md/);
  expect(state.main).toBe(before);
  expect(repo.staged()).toEqual(['README.md']);
});

test('nothing staged is no commit', async () => {
  const { repo } = await setup();
  await expect(repo.commit('nothing')).rejects.toThrow(/nothing is staged/);
});

test("status reads a commit's CI runs and what failed, without the token", async () => {
  const seen: { url: string; auth: unknown }[] = [];
  const status = ((url: string, init: RequestInit = {}) => {
    seen.push({ url, auth: (init.headers as Record<string, string>).Authorization });
    const json = (v: unknown) => Promise.resolve(Response.json(v));
    if (url.endsWith('/commits/abc/check-runs'))
      return json({
        check_runs: [
          { id: 1, name: 'test', status: 'completed', conclusion: 'failure' },
          { id: 2, name: 'deploy', status: 'completed', conclusion: 'skipped' },
        ],
      });
    if (url.endsWith('/check-runs/1/annotations'))
      return json([
        {
          path: 'app/x.ts',
          start_line: 3,
          annotation_level: 'failure',
          message: "Cannot find name 'y'.",
        },
        { path: '.github', start_line: 1, annotation_level: 'notice', message: 'runner image' },
      ]);
    return Promise.resolve(new Response('', { status: 404 }));
  }) as typeof fetch;
  const { repo } = await setup(status);
  expect(await repo.status('abc')).toEqual({
    runs: [
      {
        name: 'test',
        status: 'completed',
        conclusion: 'failure',
        problems: ["app/x.ts:3: Cannot find name 'y'."],
      },
      { name: 'deploy', status: 'completed', conclusion: 'skipped', problems: [] },
    ],
    live: null,
  });
  expect(seen.every((s) => s.auth === undefined)).toBe(true);
  expect(seen[0].url).toBe('https://gh.test/repos/JimLundin/vaulter/commits/abc/check-runs');
});
