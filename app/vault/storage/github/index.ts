// The vault as a GitHub repo: main, read through the encrypted cache (sync.ts) and written with the Git
// Data API (write.ts). Tabs tell each other when one syncs or commits, so the others read the cache.
import type { VaultFile } from '../../files.ts';
import { Offline, TRAILER, type Head, type VaultBackend, type Verify } from '../backend.ts';
import { claim, clear, keepWith } from './cache.ts';
import { github, sourceUrl, type Repo } from '../github-client/api.ts';
import { readCache, sync, type Snapshot } from './sync.ts';
import { commitChanges, revertCommit } from './write.ts';

export function githubBackend(o: {
  token: string;
  key: CryptoKey;
  repo?: Repo;
  api?: string;
  fetch?: typeof fetch;
  /** The files the app keeps (extension.ts fileRules); the rest of the repo is never read. A commit's tree
   * is built on main's, so what isn't read is kept as it is. */
  keeps?: (path: string) => boolean;
}): VaultBackend {
  const client = github(o.token, o.repo, o.api, o.fetch);
  const keeps = o.keeps ?? (() => true);
  const gh: typeof client = {
    ...client,
    tree: async (commit) => {
      const t = await client.tree(commit);
      return { ...t, entries: t.entries.filter((e) => keeps(e.path)) };
    },
  };
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('vault');
  let snap: Snapshot | null = null;
  let files: VaultFile[] = [];
  const head = (r: { snapshot: Snapshot; files: VaultFile[] }): Head => {
    snap = r.snapshot;
    ({ files } = r);
    return { files, version: snap.tree };
  };
  const wrote = (r: { snapshot: Snapshot; files: VaultFile[]; commit: string }) => {
    channel?.postMessage('synced');
    return { head: head(r), commit: r.commit };
  };
  const ready = () => {
    if (!snap) throw new Error('not synced yet');
    return snap;
  };
  // The cache is this key's before anything is read from it (cache.ts claim).
  const mine = claim(o.key);
  const kept = keepWith(o.key);

  return {
    async cached() {
      await mine;
      const c = await readCache(o.key);
      return c && head(c);
    },
    async refresh() {
      try {
        await mine;
        const r = await sync(o.key, gh, snap);
        if (!r) return null;
        channel?.postMessage('synced');
        return head(r);
      } catch (e) {
        if (e instanceof TypeError && !navigator.onLine) throw new Offline('offline', { cause: e });
        throw e;
      }
    },
    // Another tab synced or committed: its cache is ours too.
    watch(on) {
      const f = async () => {
        await mine;
        const c = await readCache(o.key);
        if (c) on(head(c));
      };
      channel?.addEventListener('message', f);
      return () => channel?.removeEventListener('message', f);
    },
    write: async (changes, message, verify: Verify) =>
      wrote(await commitChanges(o.key, gh, ready(), files, changes, message, verify)),
    revert: async (sha, verify) =>
      wrote(await revertCommit(o.key, gh, ready(), files, sha, verify)),
    history: async () => (await gh.commits()).filter((c) => c.message.includes(TRAILER)),
    patch: async (sha) => (await gh.commit(sha)).files,
    // Two requests (the commit on the day, the compare), and for a changed file's old text the base tree once and its blob.
    async since(day) {
      const s = ready();
      const base = await gh.commitAt(`${day}T00:00:00Z`);
      const now = new Map(files.map((f) => [f.path, f.text]));
      const changed = new Set(base ? await gh.compare(base, s.commit) : Object.keys(s.files));
      let tree: Promise<Map<string, string>> | undefined;
      return {
        changed,
        async before(path) {
          if (!base) return null;
          if (!changed.has(path)) return now.get(path) ?? null;
          tree ??= gh.tree(base).then((t) => new Map(t.entries.map((e) => [e.path, e.sha])));
          const sha = (await tree).get(path);
          return sha ? new TextDecoder().decode(await gh.blob(sha)) : null;
        },
      };
    },
    source: (path) => sourceUrl(path, o.repo),
    keep: {
      get: async (id) => (await mine, kept.get(id)),
      set: async (id, value) => (await mine, kept.set(id, value)),
    },
    clear,
  };
}
