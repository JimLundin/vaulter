import { describe, expect, it } from 'vitest';
import { planAll } from './loader.ts';
import { memoryKeep, SHARED, treeOf } from './testing.ts';

const deps = (files: Record<string, string>) => ({
  read: (p: string) => Promise.resolve(files[p]),
  shared: SHARED,
});

describe('the loader', () => {
  it('plans an extension with its own files and the contracts it imports, without running them', async () => {
    const files = {
      'contracts/notes/index.ts':
        "import { z } from 'zod'; export const notes = 1; throw new Error('ran');",
      'extensions/notes/index.ts':
        "import { notes } from '@contracts/notes'; export * from './a.ts';",
      'extensions/notes/a.ts': "export const a: number = 1; import type { X } from './types.ts';",
      'extensions/notes/types.ts': 'export type X = 1;',
    };
    const { plans, refused } = await planAll(treeOf(files), deps(files));
    expect(refused).toEqual([]);
    const p = plans.get('notes')!;
    expect(Object.keys(p.modules).sort()).toEqual([
      'contracts/notes/index.ts',
      'extensions/notes/a.ts',
      'extensions/notes/index.ts',
    ]);
    expect(p.shared).toEqual(['zod']);
    // Types are stripped; a type-only import is gone.
    expect(p.modules['extensions/notes/a.ts'].code).not.toMatch(/number|types/);
  });

  it("refuses only the extension whose imports can't be met", async () => {
    const files = {
      'extensions/a/index.ts': "import 'lodash';",
      'extensions/b/index.ts': "import '../a/index.ts';",
      'extensions/c/index.ts': "import './missing.ts';",
      'extensions/d/index.ts': "import './x.ts';",
      'extensions/d/x.ts': "import './index.ts';",
      'extensions/e/index.ts': 'import(someVariable);',
      'extensions/f/index.ts': "import '@pip/kernel';",
    };
    const { plans, refused } = await planAll(treeOf(files), deps(files));
    expect([...plans.keys()]).toEqual(['f']);
    const by = Object.fromEntries(refused.map((r) => [r.id, r.problems[0]]));
    expect(by.a).toMatch(/"lodash" is not available/);
    expect(by.b).toMatch(/outside extensions\/b\//);
    expect(by.c).toMatch(/not found/);
    expect(by.d).toMatch(/an import cycle/);
    expect(by.e).toMatch(/needs a string literal/);
  });

  it('reuses compiled output by blob sha', async () => {
    const files = { 'extensions/x/index.ts': 'export const x = 1;' };
    const keep = memoryKeep();
    const first = await planAll(treeOf(files), { ...deps(files), keep });
    const second = await planAll(treeOf(files), { ...deps(files), keep });
    expect([first.stats.compiled, second.stats.compiled]).toEqual([1, 0]);
  });

  it('compiles twenty extensions well inside a startup budget', async () => {
    const files: Record<string, string> = {};
    const body = Array.from(
      { length: 40 },
      (_, i) => `export const f${i} = (x: number): number => x * ${i};`,
    ).join('\n');
    for (let i = 0; i < 20; i++) {
      files[`extensions/e${i}/index.ts`] = "import { f1 } from './lib.ts'; f1(1);";
      files[`extensions/e${i}/lib.ts`] = body;
    }
    const { plans, stats } = await planAll(treeOf(files), deps(files));
    expect(plans.size).toBe(20);
    expect(stats.compiled).toBe(40);
    // Generous: the first compile also loads the compiler, and tests run in parallel.
    expect(stats.compileMs).toBeLessThan(3000);
  });
});
