// The GitHub REST client, a library with no app state: the GitHub backend uses it for the vault, the code
// feature for the app's own repo. Reading: the ref of main (conditional on its ETag), the recursive
// tree, and blobs, each checked against git's own hash before it is trusted. Writing (Git Data API): blobs,
// a tree on a base, a commit, and moving main, never by force. History: recent commits and their files; the commit
// main was at on a day, and what changed since.

import { blobSha } from '../blob-sha.ts';

export interface Repo {
  owner: string;
  name: string;
  branch: string;
}
/** The vault the app reads: VITE_VAULT_REPO at build time, "owner/name@branch". */
const parseRepo = (s: string): Repo => {
  const [, owner, name, branch = 'main'] = /^([^/]+)\/([^@]+)(?:@(.+))?$/.exec(s) ?? [];
  return { owner, name, branch };
};
export const REPO = parseRepo(import.meta.env?.VITE_VAULT_REPO || 'JimLundin/vault@main');
/** The app's own source, which the agent can change: VITE_APP_REPO at build time. */
export const APP_REPO = parseRepo(import.meta.env?.VITE_APP_REPO || 'JimLundin/vaulter@main');
/** A file of the vault on GitHub, for "view source". */
export const sourceUrl = (path: string, r = REPO) =>
  `https://github.com/${r.owner}/${r.name}/blob/${r.branch}/${encodeURI(path)}`;
export const API = import.meta.env?.VITE_GITHUB_API || 'https://api.github.com';

export interface TreeEntry {
  path: string;
  sha: string;
  type: 'blob' | 'tree' | 'commit';
}

/** A change to one path in a new tree: a blob sha, or null to delete it. */
export interface TreeChange {
  path: string;
  sha: string | null;
}

export interface CommitInfo {
  sha: string;
  message: string;
  date: string;
  parent: string;
  files: {
    filename: string;
    status: string;
    sha: string;
    previous_filename?: string;
    patch?: string;
  }[];
}

/** main moved since the commit's parent: the update would not be a fast-forward. */
export class NotFastForward extends Error {}

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function github(
  token: string,
  repo = REPO,
  base = API,
  fetchFn: typeof fetch = (...a) => fetch(...a),
) {
  const root = `${base}/repos/${repo.owner}/${repo.name}`;
  const call = async (
    path: string,
    headers: Record<string, string> = {},
    init: { method?: string; body?: unknown } = {},
  ) => {
    const res = await fetchFn(root + path, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...headers,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
    if (res.status === 422 && path.startsWith('/git/refs/')) throw new NotFastForward('main moved');
    if (res.status === 304) return res;
    if (!res.ok)
      throw new GitHubError(
        res.status,
        res.status === 401
          ? 'GitHub rejected the token (expired or revoked?)'
          : `GitHub ${res.status} on ${path}`,
      );
    return res;
  };
  return {
    /** The commit main points at, or null when it hasn't moved since `etag`. */
    async ref(etag = ''): Promise<{ commit: string; etag: string } | null> {
      const res = await call(
        `/git/ref/heads/${repo.branch}`,
        etag ? { 'If-None-Match': etag } : {},
      );
      if (res.status === 304) return null;
      return { commit: (await res.json()).object.sha, etag: res.headers.get('ETag') ?? '' };
    },
    async tree(commit: string): Promise<{ sha: string; entries: TreeEntry[] }> {
      const t = await (await call(`/git/trees/${commit}?recursive=1`)).json();
      if (t.truncated) throw new Error('the repository tree is too large to list in one request');
      return { sha: t.sha, entries: t.tree };
    },
    async blob(sha: string): Promise<Uint8Array<ArrayBuffer>> {
      const b = await (await call(`/git/blobs/${sha}`)).json();
      const bytes = Uint8Array.from(atob(String(b.content).replace(/\n/g, '')), (c) =>
        c.charCodeAt(0),
      );
      if ((await blobSha(bytes)) !== sha) throw new Error(`blob ${sha} does not match its hash`);
      return bytes;
    },

    async createBlob(text: string): Promise<string> {
      return (
        await (
          await call(
            '/git/blobs',
            {},
            { method: 'POST', body: { content: text, encoding: 'utf-8' } },
          )
        ).json()
      ).sha;
    },
    async createTree(baseTree: string, changes: TreeChange[]): Promise<string> {
      const tree = changes.map((c) => ({ path: c.path, mode: '100644', type: 'blob', sha: c.sha }));
      return (
        await (
          await call('/git/trees', {}, { method: 'POST', body: { base_tree: baseTree, tree } })
        ).json()
      ).sha;
    },
    async createCommit(message: string, tree: string, parent: string): Promise<string> {
      return (
        await (
          await call(
            '/git/commits',
            {},
            { method: 'POST', body: { message, tree, parents: [parent] } },
          )
        ).json()
      ).sha;
    },
    /** Moves main to `commit`; throws NotFastForward if main is no longer its parent. */
    async updateRef(commit: string): Promise<void> {
      await call(
        `/git/refs/heads/${repo.branch}`,
        {},
        { method: 'PATCH', body: { sha: commit, force: false } },
      );
    },
    async commits(perPage = 30): Promise<{ sha: string; message: string; date: string }[]> {
      const list = await (await call(`/commits?sha=${repo.branch}&per_page=${perPage}`)).json();
      return list.map((c: any) => ({
        sha: c.sha,
        message: c.commit.message,
        date: c.commit.committer?.date ?? '',
      }));
    },
    /** The newest commit on main at or before `date` (ISO 8601), or null when main is younger. */
    async commitAt(date: string): Promise<string | null> {
      const list = await (
        await call(`/commits?sha=${repo.branch}&until=${encodeURIComponent(date)}&per_page=1`)
      ).json();
      return list[0]?.sha ?? null;
    },
    /** The paths that differ between two commits (GitHub lists at most 300). */
    async compare(from: string, to: string): Promise<string[]> {
      return ((await (await call(`/compare/${from}...${to}`)).json()).files ?? []).map(
        (f: any) => f.filename,
      );
    },
    async commit(sha: string): Promise<CommitInfo> {
      const c = await (await call(`/commits/${sha}`)).json();
      return {
        sha: c.sha,
        message: c.commit.message,
        date: c.commit.committer?.date ?? '',
        parent: c.parents[0]?.sha ?? '',
        files: c.files ?? [],
      };
    },
  };
}
export type GitHub = ReturnType<typeof github>;
