// Main: the extensions and contracts this page was built with, as text, path → source. Under `npm run
// dev` it is the working tree as Vite serves it, so an edit shows on the next reload and recompiles
// only that file. Drafts and older commits come through a source provider (source-github) instead.
const files = import.meta.glob<string>(
  // Not the tests, nor the conformance suites: CI runs those.
  [
    '/extensions/**/*.{ts,tsx}',
    '/contracts/**/*.ts',
    '!**/*.test.{ts,tsx}',
    '!/contracts/**/conformance.ts',
    '!/contracts/conformance.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

export const pageFiles: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, text]) => [path.slice(1), text]),
);
