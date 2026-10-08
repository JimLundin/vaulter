// The app's own source (vaulter) as the agent works on it: main's tree read through the GitHub API, edits
// staged in memory, and one commit to main for all of them, never by force. When main moved meanwhile the
// commit is rebuilt on it, unless one of the same files changed there. Every push to main runs the app's
// CI (lint, type check, tests) and deploys only if it passes; `status` reads that back.
import type { GitHub, Repo } from '../../github/api.ts';
import { NotFastForward } from '../../github/api.ts';
import { blobSha } from '../../core/blob-sha.ts';
import { TRAILER } from '../../core/backend.ts';

interface Head {
  commit: string;
  tree: string;
  files: Map<string, string>;
}

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  problems: string[];
}

/** The parts of GitHub's check runs and annotations read here. */
interface Run {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}
interface Annotation {
  path: string;
  start_line: number;
  annotation_level: string;
  message: string;
}

const SEARCH_MAX = 50;
const BATCH = 8;
/** How long main's tree is trusted while nothing is staged; staged edits keep the tree they were read from. */
const FRESH_MS = 60_000;

export function codeRepo(
  gh: GitHub,
  repo: Repo,
  api: string,
  fetchFn: typeof fetch = (...a) => fetch(...a),
) {
  let head: Head | null = null;
  let loadedAt = 0;
  const texts = new Map<string, string | null>();
  const staged = new Map<string, string | null>();

  const load = async (): Promise<Head> => {
    const ref = await gh.ref();
    if (!ref) throw new Error('main has no commit');
    const t = await gh.tree(ref.commit);
    return {
      commit: ref.commit,
      tree: t.sha,
      files: new Map(t.entries.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha])),
    };
  };
  const current = async () => {
    if (!head || (!staged.size && Date.now() - loadedAt > FRESH_MS)) {
      head = await load();
      loadedAt = Date.now();
    }
    return head;
  };
  /** A blob as text, or null when it isn't UTF-8 (an image). */
  const text = async (sha: string) => {
    if (!texts.has(sha)) {
      try {
        texts.set(sha, new TextDecoder('utf-8', { fatal: true }).decode(await gh.blob(sha)));
      } catch (e) {
        if (!(e instanceof TypeError)) throw e;
        texts.set(sha, null);
      }
    }
    return texts.get(sha) ?? null;
  };
  /** Every path with staged edits applied. */
  const paths = async () => {
    const all = new Set((await current()).files.keys());
    for (const [p, t] of staged)
      if (t === null) all.delete(p);
      else all.add(p);
    return [...all].sort();
  };
  const read = async (path: string) => {
    if (staged.has(path)) return staged.get(path) ?? null;
    const sha = (await current()).files.get(path);
    return sha ? text(sha) : null;
  };

  return {
    /** The commit main is at now. */
    latest: async () => (await gh.ref())?.commit ?? '',
    list: async (prefix = '') => (await paths()).filter((p) => p.startsWith(prefix)),
    read,
    /** Lines containing `query` (case-insensitive), as path:line: text, with staged edits applied. */
    async search(query: string, prefix = '') {
      const q = query.toLowerCase();
      const files = (await paths()).filter(
        (p) => p.startsWith(prefix) && p !== 'package-lock.json',
      );
      const hits: string[] = [];
      for (let i = 0; i < files.length && hits.length < SEARCH_MAX; i += BATCH) {
        const batch = files.slice(i, i + BATCH);
        // biome-ignore lint/performance/noAwaitInLoops: a few blobs at a time; GitHub limits concurrent requests
        const bodies = await Promise.all(batch.map(read));
        batch.forEach((p, j) => {
          for (const [n, line] of (bodies[j] ?? '').split('\n').entries())
            if (line.toLowerCase().includes(q) && hits.length < SEARCH_MAX)
              hits.push(`${p}:${n + 1}: ${line.trim().slice(0, 200)}`);
        });
      }
      return hits;
    },
    stage(path: string, value: string | null) {
      staged.set(path, value);
    },
    unstage: (path: string) => staged.delete(path),
    staged: () => [...staged.keys()].sort(),

    /** Commits everything staged to main as one commit; returns its sha. */
    async commit(message: string) {
      if (!staged.size) throw new Error('nothing is staged');
      const full = message.includes(TRAILER) ? message : `${message.trim()}\n\n${TRAILER}`;
      const changes = await Promise.all(
        [...staged].map(async ([path, t]) => {
          if (t === null) return { path, sha: null };
          const sha = await gh.createBlob(t);
          if (sha !== (await blobSha(t)))
            throw new Error(`GitHub stored ${path} as something else`);
          return { path, sha };
        }),
      );
      let base = await current();
      for (let attempt = 0; ; attempt++) {
        // biome-ignore lint/performance/noAwaitInLoops: each attempt is built on the main the last one lost to
        const tree = await gh.createTree(base.tree, changes);
        const commit = await gh.createCommit(full, tree, base.commit);
        try {
          await gh.updateRef(commit);
        } catch (e) {
          if (!(e instanceof NotFastForward) || attempt >= 3) throw e;
          const moved = await load();
          const conflicts = changes
            .map((c) => c.path)
            .filter((p) => moved.files.get(p) !== base.files.get(p));
          if (conflicts.length)
            throw new Error(
              `changed on main meanwhile: ${conflicts.join(', ')}; read them again, redo the edit, commit again`,
              { cause: e },
            );
          base = moved;
          continue;
        }
        const files = new Map(base.files);
        for (const c of changes)
          if (c.sha === null) files.delete(c.path);
          else files.set(c.path, c.sha);
        head = { commit, tree, files };
        loadedAt = Date.now();
        staged.clear();
        return commit;
      }
    },

    /** The CI runs for a commit (public: no token), with what failed, and whether it is live. */
    async status(sha: string): Promise<{ runs: CheckRun[]; live: string | null }> {
      const get = async <T>(path: string): Promise<T> => {
        const res = await fetchFn(`${api}/repos/${repo.owner}/${repo.name}${path}`, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
        return res.json();
      };
      const { check_runs: list = [] } = await get<{ check_runs?: Run[] }>(
        `/commits/${sha}/check-runs`,
      );
      const runs = await Promise.all(
        list.map(async (r): Promise<CheckRun> => {
          const failed = r.conclusion && r.conclusion !== 'success' && r.conclusion !== 'skipped';
          const notes = failed ? await get<Annotation[]>(`/check-runs/${r.id}/annotations`) : [];
          return {
            name: r.name,
            status: r.status,
            conclusion: r.conclusion,
            problems: notes
              .filter((a) => a.annotation_level !== 'notice')
              .slice(0, 30)
              .map((a) => `${a.path}:${a.start_line}: ${a.message}`.slice(0, 400)),
          };
        }),
      );
      return { runs, live: await live(fetchFn) };
    },
  };
}
export type CodeRepo = ReturnType<typeof codeRepo>;

/** The commit the published app was built from (version.json, written by the deploy), or null. */
async function live(fetchFn: typeof fetch) {
  try {
    const res = await fetchFn(new URL('version.json', document.baseURI).href, {
      cache: 'no-store',
    });
    return res.ok ? String((await res.json()).commit ?? '') || null : null;
  } catch {
    return null;
  }
}
