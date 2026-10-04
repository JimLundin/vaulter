/** The modules every sandbox has one copy of, which compiled code imports by these names
 * (src/sandbox/main.ts loads them). */
export const SHARED = [
  '@pip/kernel',
  'zod',
  'react',
  'react/jsx-runtime',
  'react-dom/client',
] as const;
