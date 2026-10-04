// The source under `npm run dev`: the working tree, as Vite serves it, provided by the kernel itself
// (import.meta.glob exists only in the bundle, not in a sandbox). The "commit" is "working-tree" and a
// file's sha is a hash of its text, so an edit shows on the next reload and recompiles only that file.
// It can't write: drafts need the real repo.
import type { SourceV1 } from '@contracts/extensions.source';

const files = import.meta.glob<string>(
  ['/extensions/**/*.{ts,tsx}', '/contracts/**/*.ts', '!**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
);

const sha = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const readOnly = () => Promise.reject(new Error('the working tree is read-only here'));

export const devSource: SourceV1 = {
  head: () => Promise.resolve('working-tree'),
  tree: () =>
    Promise.all(
      Object.entries(files).map(async ([p, text]) => ({ path: p.slice(1), sha: await sha(text) })),
    ),
  read: (_repo, path) => Promise.resolve(files[`/${path}`]),
  refs: () => Promise.resolve(['working-tree']),
  commit: readOnly,
  merge: readOnly,
  checks: () => Promise.resolve({ state: 'none', runs: [] }),
};
