/** The modules the page has one copy of, which compiled code imports by these names (src/main.ts
 * hands them to the kernel). */
export const SHARED = [
  '@pip/kernel',
  'zod',
  'react',
  'react/jsx-runtime',
  'react-dom/client',
] as const;
