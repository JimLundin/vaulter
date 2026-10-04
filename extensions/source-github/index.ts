// The bootstrap source provider: reads extensions/ and contracts/ from a GitHub repo at a commit. It ships
// inside the kernel bundle (the only extension that does, with source-dev), and loads like any other.
// The token is optional for a public repo, which then has GitHub's lower rate limit.
import { defineExtension } from '@pip/kernel';
import { source } from '@contracts/extensions.source';

const API = 'https://api.github.com';
const ours = (path: string) => path.startsWith('extensions/') || path.startsWith('contracts/');

export default defineExtension({
  id: 'source-github',
  version: '1.0.0',
  provides: { source },
  secrets: {
    token: {
      label: 'GitHub token: fine-grained, this repo only, Contents read and write',
      hosts: ['api.github.com'],
    },
  },
  agentGuide: 'Reads extension source from GitHub. Pip never needs to call this.',
  setup(_, kernel) {
    const get = async (path: string, accept: string) => {
      const secret = (await kernel.hasSecret('token')) ? 'token' : undefined;
      const r = await kernel.fetch(`${API}${path}`, {
        headers: { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' },
        secret,
      });
      if (!r.ok) throw new Error(`GitHub ${r.status} for ${path}`);
      return r;
    };
    const json = async <T>(path: string) =>
      (await (await get(path, 'application/vnd.github+json')).json()) as T;

    return {
      source: {
        head: async (repo, ref) =>
          (
            await get(
              `/repos/${repo}/commits/${encodeURIComponent(ref)}`,
              'application/vnd.github.sha',
            )
          ).text(),
        async tree(repo, commit) {
          const t = await json<{
            truncated: boolean;
            tree: { path: string; type: string; sha: string }[];
          }>(`/repos/${repo}/git/trees/${commit}?recursive=1`);
          if (t.truncated)
            throw new Error(`the tree at ${commit} is too large to list in one request`);
          return t.tree
            .filter((e) => e.type === 'blob' && ours(e.path))
            .map(({ path, sha }) => ({ path, sha }));
        },
        read: async (repo, _path, sha) =>
          (await get(`/repos/${repo}/git/blobs/${sha}`, 'application/vnd.github.raw')).text(),
        refs: async (repo) =>
          (await json<{ name: string }[]>(`/repos/${repo}/branches?per_page=100`)).map(
            (b) => b.name,
          ),
      },
    };
  },
});
