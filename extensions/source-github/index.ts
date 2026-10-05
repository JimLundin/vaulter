// The source provider for GitHub: reads extensions/ and contracts/ from the repo at a commit, for the
// drafts a device tries and a pinned commit (main is the page's own), and CI's checks on a commit. The
// token is optional for a public repo, at GitHub's lower rate limit. Writing drafts comes with the
// agent that writes them.
import { defineExtension } from '#kernel';
import { type Checks, source } from '#contracts/extensions.source';
import { net } from '#contracts/net';

const API = 'https://api.github.com';
const ours = (path: string) =>
  (path.startsWith('extensions/') || path.startsWith('contracts/')) &&
  !path.split('/').includes('..');

export default defineExtension({
  id: 'source-github',
  version: '1.1.0',
  provides: { source },
  // Without net@1 (the secrets extension), it reads a public repo without a token.
  optional: { net },
  secrets: {
    token: {
      label: 'GitHub token: fine-grained, this repo only, Contents read',
      hosts: ['api.github.com'],
    },
  },
  agentGuide: 'Reads extension source on GitHub: drafts and older commits. Vaulter never needs it.',
  setup({ net }) {
    const ok = async (path: string, accept = 'application/vnd.github+json') => {
      const secret = (await net?.hasSecret('token')) ? 'token' : undefined;
      const r = await (net?.fetch ?? fetch)(`${API}${path}`, {
        headers: { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' },
        secret,
      });
      if (!r.ok) throw new Error(`GitHub ${r.status} for ${path}`);
      return r;
    };
    const json = async <T>(path: string) => (await (await ok(path)).json()) as T;
    const head = async (repo: string, ref: string) =>
      (
        await ok(`/repos/${repo}/commits/${encodeURIComponent(ref)}`, 'application/vnd.github.sha')
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
          (await ok(`/repos/${repo}/git/blobs/${sha}`, 'application/vnd.github.raw')).text(),
        refs: async (repo) =>
          (await json<{ name: string }[]>(`/repos/${repo}/branches?per_page=100`)).map(
            (b) => b.name,
          ),

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
