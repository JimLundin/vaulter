import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { fakeGitHub } from './fake-github.ts';
import { closeDb, newCacheKey } from '../../core/store.ts';
import { forget } from '../../core/unlock.ts';
import { githubBackend } from './index.ts';
import { memoryBackend } from '../memory.ts';

let key: CryptoKey;
beforeEach(async () => {
  key = await newCacheKey();
});
afterEach(async () => {
  await forget();
  await closeDb();
});

test('since: the commit on the day, one compare, and old text only for changed files', async () => {
  const f = await fakeGitHub({ 'Alpha.md': '# Alpha v1', 'Beta.md': '# Beta' });
  await f.push({ 'Alpha.md': '# Alpha v2' }, 'before the week', '2026-09-20T10:00:00Z');
  const base = f.state.main;
  await f.push(
    { 'Alpha.md': '# Alpha v3', 'Gamma.md': '# Gamma' },
    'this week',
    '2026-09-28T10:00:00Z',
  );
  const backend = githubBackend({ token: 'tok', key, api: 'https://gh.test', fetch: f.fetchFn });
  await backend.refresh();
  f.state.calls.length = 0;
  const h = await backend.since!('2026-09-25');
  expect([...h.changed].sort()).toEqual(['Alpha.md', 'Gamma.md']);
  expect(f.state.calls).toEqual([
    // biome-ignore lint/security/noSecrets: a GitHub API path, not a secret
    'GET /commits?sha=main&until=2026-09-25T00%3A00%3A00Z&per_page=1',
    `GET /compare/${base}...${f.state.main}`,
  ]);
  expect(await h.before('Beta.md')).toBe('# Beta');
  expect(f.state.calls).toHaveLength(2);
  expect(await h.before('Alpha.md')).toBe('# Alpha v2');
  expect(await h.before('Gamma.md')).toBe(null);
  expect(f.state.calls.filter((c) => c.startsWith('GET /git/trees/'))).toHaveLength(1);
});

test('since: everything changed when main is younger than the day', async () => {
  const f = await fakeGitHub({ 'Alpha.md': '# Alpha' });
  const backend = githubBackend({ token: 'tok', key, api: 'https://gh.test', fetch: f.fetchFn });
  await backend.refresh();
  const h = await backend.since!('2020-01-01');
  expect([...h.changed]).toEqual(['Alpha.md']);
  expect(await h.before('Alpha.md')).toBe(null);
});

test('since in memory: what changed after the day, and the text before it', async () => {
  const m = memoryBackend({ 'Alpha.md': '# Alpha' });
  m.push({ 'Alpha.md': '# Alpha v2', 'Beta.md': '# Beta' });
  const h = await m.backend.since!('2000-01-01');
  expect([...h.changed].sort()).toEqual(['Alpha.md', 'Beta.md']);
  expect(await h.before('Alpha.md')).toBe('# Alpha');
  expect((await m.backend.since!('2999-01-01')).changed.size).toBe(0);
});
