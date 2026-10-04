// The bootstrap source provider: reads extensions/ and contracts/ from a GitHub repo at a commit, and
// writes Pip's drafts. It ships inside the kernel bundle (the only extension that does) and is compiled
// and loaded like any other. The token is optional for reading a public repo, at GitHub's lower rate limit.
import { defineExtension } from '@pip/kernel';
import { type Checks, source } from '@contracts/extensions.source';

const API = 'https://api.github.com';
const ours = (path: string) =>
  (path.startsWith('extensions/') || path.startsWith('contracts/')) &&
  !path.split('/').includes('..');

export default defineExtension({
  id: 'source-github',
  version: '1.1.0',
  provides: { source },
  secrets: {
    token: {
      label: 'GitHub token: fine-grained, this repo only, Contents read and write',
      hosts: ['api.github.com'],
    },
  },
  agentGuide: 'Reads and writes extension source on GitHub. Pip writes drafts through it.',
  setup(_, kernel) {
    const call = async (
      path: string,
      init: { method?: string; body?: unknown; accept?: string } = {},
    ) => {
      const secret = (await kernel.hasSecret('token')) ? 'token' : undefined;
      return kernel.fetch(`${API}${path}`, {
        method: init.method,
        headers: {
          Accept: init.accept ?? 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        secret,
      });
    };
    const ok = async (path: string, init?: Parameters<typeof call>[1]) => {
      const r = await call(path, init);
      if (!r.ok) throw new Error(`GitHub ${r.status} for ${init?.method ?? 'GET'} ${path}`);
      return r;
    };
    const json = async <T>(path: string, init?: Parameters<typeof call>[1]) =>
      (await (await ok(path, init)).json()) as T;
    const refSha = async (repo: string, branch: string) => {
      const r = await call(`/repos/${repo}/git/ref/heads/${branch}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`GitHub ${r.status} reading ${branch}`);
      return ((await r.json()) as { object: { sha: string } }).object.sha;
    };
    const head = async (repo: string, ref: string) =>
      (
        await ok(`/repos/${repo}/commits/${encodeURIComponent(ref)}`, {
          accept: 'application/vnd.github.sha',
        })
      ).text();

    return {
      source: {
        head,
        async tree(repo, commit) {
          const t = await json<{
            truncated: boolean;
            tree: { path: string; type: string; sha: string }[];
          }>(`/repos/${repo}/git/trees/${commit}?recursive=1`);
          if (t.truncated) throw new Error(`the tree at ${commit} is too large to list at once`);
          return t.tree
            .filter((e) => e.type === 'blob' && ours(e.path))
            .map(({ path, sha }) => ({ path, sha }));
        },
        read: async (repo, _path, sha) =>
          (
            await ok(`/repos/${repo}/git/blobs/${sha}`, { accept: 'application/vnd.github.raw' })
          ).text(),
        refs: async (repo) =>
          (await json<{ name: string }[]>(`/repos/${repo}/branches?per_page=100`)).map(
            (b) => b.name,
          ),

        async commit(repo, change) {
          // Pip writes drafts: on a draft branch, and never the kernel or anything else outside these.
          if (!/^draft\/[\w.-]+$/.test(change.branch))
            throw new Error(`${change.branch} is not a draft branch (draft/<name>)`);
          const outside = change.files.filter((f) => !ours(f.path)).map((f) => f.path);
          if (outside.length)
            throw new Error(
              `only extensions/ and contracts/ can be written: ${outside.join(', ')}`,
            );
          const existing = await refSha(repo, change.branch);
          const parent = existing ?? (await head(repo, change.base ?? 'main'));
          if (change.parent && existing && existing !== change.parent)
            throw new Error(`${change.branch} moved since ${change.parent.slice(0, 7)}`);
          const base = await json<{ tree: { sha: string } }>(
            `/repos/${repo}/git/commits/${parent}`,
          );
          const entries = await Promise.all(
            change.files.map(async (f) => ({
              path: f.path,
              mode: '100644',
              type: 'blob',
              sha:
                f.content === null
                  ? null
                  : (
                      await json<{ sha: string }>(`/repos/${repo}/git/blobs`, {
                        method: 'POST',
                        body: { content: f.content, encoding: 'utf-8' },
                      })
                    ).sha,
            })),
          );
          const tree = await json<{ sha: string }>(`/repos/${repo}/git/trees`, {
            method: 'POST',
            body: { base_tree: base.tree.sha, tree: entries },
          });
          const commit = await json<{ sha: string }>(`/repos/${repo}/git/commits`, {
            method: 'POST',
            body: { message: change.message, tree: tree.sha, parents: [parent] },
          });
          if (existing)
            await ok(`/repos/${repo}/git/refs/heads/${change.branch}`, {
              method: 'PATCH',
              body: { sha: commit.sha, force: false },
            });
          else
            await ok(`/repos/${repo}/git/refs`, {
              method: 'POST',
              body: { ref: `refs/heads/${change.branch}`, sha: commit.sha },
            });
          return commit.sha;
        },

        async merge(repo, base, headRef, message) {
          const r = await call(`/repos/${repo}/merges`, {
            method: 'POST',
            body: { base, head: headRef, commit_message: message },
          });
          if (r.status === 204) return head(repo, base);
          if (r.status === 409) throw new Error(`${headRef} conflicts with ${base}`);
          if (!r.ok) throw new Error(`GitHub ${r.status} merging ${headRef}`);
          return ((await r.json()) as { sha: string }).sha;
        },

        async checks(repo, commit): Promise<Checks> {
          const { check_runs: runs } = await json<{
            check_runs: { name: string; status: string; conclusion: string | null }[];
          }>(`/repos/${repo}/commits/${commit}/check-runs?per_page=100`);
          const states = runs.map((r) => ({
            name: r.name,
            state: r.status === 'completed' ? (r.conclusion ?? 'unknown') : r.status,
          }));
          const bad = ['failure', 'cancelled', 'timed_out', 'action_required'];
          const state: Checks['state'] = !runs.length
            ? 'none'
            : runs.some((r) => r.status !== 'completed')
              ? 'pending'
              : runs.some((r) => bad.includes(r.conclusion ?? ''))
                ? 'failure'
                : 'success';
          return { state, runs: states };
        },
      },
    };
  },
});
