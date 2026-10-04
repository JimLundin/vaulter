import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import * as kernel from './api.ts';
import { type LoaderDeps, load, type Tree } from './loader.ts';
import { resolve } from './resolve.ts';

// In Node a module URL is a data: URL; in the browser it is a blob: URL.
const deps = (files: Record<string, string>): LoaderDeps => ({
  read: async (path) => files[path],
  shared: { '@pip/kernel': kernel, zod: z },
  url: (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`,
  load: (url) => import(/* @vite-ignore */ url),
});
const tree = (files: Record<string, string>): Tree => ({
  commit: 'abc1234',
  files: new Map(Object.keys(files).map((p) => [p, `sha-${p}`])),
});
const run = (files: Record<string, string>) => load(tree(files), deps(files));

const contract = `
import { defineContract } from '@pip/kernel';
import { z } from 'zod';
export interface NotesV1 { append(text: string): number }
export const notes = defineContract<NotesV1>({
  name: 'notes', version: '1.0.0', inputs: { append: z.tuple([z.string()]) },
});
`;

describe('the loader', () => {
  it('compiles an extension, its own files and the contracts it imports', async () => {
    const files = {
      'contracts/notes/index.ts': contract,
      'extensions/notes/index.ts': `
        import { defineExtension } from '@pip/kernel';
        import { notes } from '@contracts/notes';
        import { store } from './reexport.ts';
        export default defineExtension({
          id: 'notes', version: '1.0.0', provides: { notes },
          setup: () => ({ notes: { append: (t: string): number => store.push(t) } }),
        });`,
      'extensions/notes/store.ts': 'export const store: string[] = [];',
      'extensions/notes/reexport.ts': "export * from './store.ts';",
      'extensions/voice/index.ts': `
        import { defineExtension } from '@pip/kernel';
        import { notes } from '@contracts/notes';
        export default defineExtension({ id: 'voice', version: '1.0.0', requires: { notes }, setup() {} });`,
    };
    const out = await run(files);
    expect(out.refused).toEqual([]);
    expect(out.stats.files).toBe(5);
    const r = resolve(out.candidates);
    expect(r.refused).toEqual([]);
    expect(r.accepted.map((a) => a.id)).toEqual(['notes', 'voice']);
    // One module per file: both extensions hold the same contract handle.
    const [n, v] = r.accepted;
    expect(n.statics.provides.notes).toBe(v.statics.requires.notes);
  });

  it('compiles TSX against the shared jsx runtime', async () => {
    const files = {
      'extensions/view/index.tsx': `
        import { defineExtension } from '@pip/kernel';
        const Hello = ({ name }: { name: string }) => <p>Hello {name}</p>;
        export default defineExtension({ id: 'view', version: '1.0.0', setup() { void Hello; } });`,
    };
    const jsx = { jsx: () => null, jsxs: () => null, Fragment: 'f' };
    const out = await load(tree(files), {
      ...deps(files),
      shared: { ...deps(files).shared, 'react/jsx-runtime': jsx },
    });
    expect(out.refused).toEqual([]);
  });

  it("refuses only the extension whose imports can't be met", async () => {
    const files = {
      'extensions/a/index.ts': "import 'lodash'; export default 1;",
      'extensions/b/index.ts': "import '../a/index.ts'; export default 1;",
      'extensions/c/index.ts': "import './missing.ts'; export default 1;",
      'extensions/d/index.ts': "import './x.ts'; export default 1;",
      'extensions/d/x.ts': "import './index.ts'; export const x = 1;",
      'extensions/e/index.ts':
        "import { defineExtension } from '@pip/kernel'; export default defineExtension({ id: 'e', version: '1.0.0', setup() {} });",
    };
    const out = await run(files);
    expect(out.candidates.map((c) => c.origin)).toEqual(['extensions/e']);
    const problems = Object.fromEntries(out.refused.map((r) => [r.id, r.problems[0]]));
    expect(problems.a).toMatch(/"lodash" is not available/);
    expect(problems.b).toMatch(/outside extensions\/b\//);
    expect(problems.c).toMatch(/not found/);
    expect(problems.d).toMatch(/an import cycle/);
  });

  it('reuses compiled output by blob sha', async () => {
    const files = { 'contracts/notes/index.ts': contract };
    const m = new Map<string, unknown>();
    const keep = {
      get: <T>(k: string) => Promise.resolve(m.get(k) as T | undefined),
      set: (k: string, v: unknown) => Promise.resolve(void m.set(k, v)),
      del: () => Promise.resolve(),
    };
    const files2 = {
      ...files,
      'extensions/x/index.ts': "import '@contracts/notes'; export default 1;",
    };
    const first = await load(tree(files2), { ...deps(files2), keep });
    const second = await load(tree(files2), { ...deps(files2), keep });
    expect([first.stats.compiled, second.stats.compiled]).toEqual([2, 0]);
  });

  it('compiles twenty extensions well inside a startup budget', async () => {
    const files: Record<string, string> = { 'contracts/notes/index.ts': contract };
    const body = Array.from(
      { length: 40 },
      (_, i) => `export const f${i} = (x: number): number => x * ${i};`,
    ).join('\n');
    for (let i = 0; i < 20; i++) {
      files[`extensions/e${i}/index.ts`] = `
        import { defineExtension } from '@pip/kernel';
        import { notes } from '@contracts/notes';
        import { f1 } from './lib.ts';
        export default defineExtension({ id: 'e${i}', version: '1.0.0', requires: { notes }, setup() { f1(1); } });`;
      files[`extensions/e${i}/lib.ts`] = body;
    }
    const out = await run(files);
    expect(out.candidates).toHaveLength(20);
    expect(out.stats.compiled).toBe(41);
    expect(out.stats.compileMs).toBeLessThan(1000);
  });
});
