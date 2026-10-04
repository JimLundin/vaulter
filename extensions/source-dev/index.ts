// The source provider under `npm run dev`: the working tree, as Vite serves it, so an edit shows on the
// next reload without a commit. The "commit" is "working-tree" and a file's sha is a hash of its text.
import { defineExtension } from '@pip/kernel';
import { source } from '@contracts/extensions.source';

const files = import.meta.glob<string>(
  ['/extensions/**/*.{ts,tsx}', '/contracts/**/*.ts', '!**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
);

const sha = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export default defineExtension({
  id: 'source-dev',
  version: '1.0.0',
  provides: { source },
  agentGuide: 'Reads extension source from the working tree in development.',
  setup: () => ({
    source: {
      head: () => Promise.resolve('working-tree'),
      tree: () =>
        Promise.all(
          Object.entries(files).map(async ([p, text]) => ({
            path: p.slice(1),
            sha: await sha(text),
          })),
        ),
      read: (_repo, path) => Promise.resolve(files[`/${path}`]),
      refs: () => Promise.resolve(['working-tree']),
    },
  }),
});
