// Running the kernel in tests: real sandboxes in this process (inProcessRealms), fed from a tree of
// source strings, with memory storage. Not isolated, but the same protocol and the same checks.
import { describe, expect, it } from 'vitest';
import type { Suite } from './conformance.ts';
import type { AnyContract } from './contract.ts';
import { runSuite } from './conformance.ts';
import { Kernel, type KernelOptions } from './kernel.ts';
import { planAll, planner, type Tree } from './loader.ts';
import { inProcessRealms } from './realm.ts';
import { type KernelKeep, secretStore } from './secrets.ts';
import { memoryStorage } from './storage.ts';

export const SHARED = ['@pip/kernel', 'zod'] as const;

export const memoryKeep = (): KernelKeep => {
  const m = new Map<string, unknown>();
  return {
    get: <T>(id: string) => Promise.resolve(m.get(id) as T | undefined),
    set: (id, v) => {
      m.set(id, v);
      return Promise.resolve();
    },
    del: (id) => {
      m.delete(id);
      return Promise.resolve();
    },
  };
};

export const treeOf = (files: Record<string, string>, commit = 'test0000'): Tree => ({
  commit,
  files: new Map(Object.keys(files).map((p) => [p, `${p}@${files[p].length}`])),
});

/** A kernel over `files`, with every extension in them planned and started. */
export async function startTree(
  files: Record<string, string>,
  opts: Partial<KernelOptions> & {
    choose?: Record<string, string>;
    /** The kernel's own providers, given before anything starts. */
    provide?: [AnyContract, object][];
  } = {},
) {
  const storage = opts.storage ?? memoryStorage();
  const keep = memoryKeep();
  const kernel = new Kernel({
    realms: inProcessRealms({
      url: (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`,
      load: (url) => import(/* @vite-ignore */ url),
      shared: { '@pip/kernel': () => import('./api.ts'), zod: () => import('zod') },
    }),
    secrets: opts.secrets ?? secretStore(memoryKeep()),
    storage,
    keep,
    ...opts,
  });
  for (const [c, impl] of opts.provide ?? []) kernel.provide(c, impl);
  const tree = treeOf(files);
  const deps = { read: (p: string) => Promise.resolve(files[p]), shared: SHARED };
  const { plans, refused } = await planAll(tree, deps);
  const p = planner(tree, deps);
  const started = await kernel.start(plans, {
    choose: opts.choose,
    conformance: async (c) => {
      const path = `contracts/${c.name}/conformance.ts`;
      return tree.files.has(path) ? p.plan(path) : null;
    },
  });
  return {
    kernel,
    storage,
    keep,
    refused: [...refused, ...started.refused],
    started: started.started,
  };
}

/** A contract's conformance suite under Vitest, against `make()`'s provider. */
export function conformanceInVitest<T>(suite: Suite<T>, make: (n: number) => T) {
  describe(`${suite.contract} conformance`, () => {
    it.each(suite.checks.map((c) => c.name))('%s', async (name) => {
      const only = { ...suite, checks: suite.checks.filter((c) => c.name === name) };
      const [r] = await runSuite(only, make);
      expect(r.error).toBeUndefined();
    });
  });
}
