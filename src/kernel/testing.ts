// Running the kernel in tests: the same boot as in the browser (boot.ts), on a test device that stands
// in for one: modules as data: URLs, memory storage, and a source made of strings.
import type { SourceV1 } from '@contracts/extensions.source';
import { describe, expect, it } from 'vitest';
import type { Access } from './access.ts';
import { boot, type Device } from './boot.ts';
import { type Config, defaultConfig } from './config.ts';
import type { Suite } from './conformance.ts';
import { runSuite } from './conformance.ts';
import type { AnyContract } from './contract.ts';
import type { Tree } from './loader.ts';
import type { KernelKeep } from './secrets.ts';
import { memoryStorage } from './storage.ts';

/** The shared modules tests offer extensions. */
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

export const REPO = 'o/r';

const sha1 = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** A source over branches of files, each branch one commit: path → text. Set `offline` to make every
 * read of the repo fail, as with no network; `merge` and `checks` may be replaced. */
export function testSource(branches: Record<string, Record<string, string>>) {
  const t = {
    branches,
    offline: false,
    merged: [] as { base: string; head: string; message: string }[],
    source: undefined as unknown as SourceV1,
  };
  const reach = () => {
    if (t.offline) throw new TypeError('Failed to fetch');
  };
  const commitOf = async (ref: string) => {
    const files = t.branches[ref];
    if (!files) throw new Error(`no branch ${ref}`);
    return `${ref.replaceAll('/', '-')}-${(await sha1(JSON.stringify(files))).slice(0, 8)}`;
  };
  const filesAt = async (commit: string) => {
    for (const ref of Object.keys(t.branches))
      if ((await commitOf(ref)) === commit) return t.branches[ref];
    throw new Error(`no commit ${commit}`);
  };
  t.source = {
    head: async (_repo, ref) => {
      reach();
      return commitOf(ref);
    },
    tree: async (_repo, commit) => {
      reach();
      const files = await filesAt(commit);
      return Promise.all(
        Object.entries(files).map(async ([path, text]) => ({ path, sha: await sha1(text) })),
      );
    },
    read: async (_repo, path, sha) => {
      reach();
      for (const files of Object.values(t.branches))
        if (path in files && (await sha1(files[path])) === sha) return files[path];
      throw new Error(`no ${path} at ${sha}`);
    },
    refs: async () => Object.keys(t.branches),
    commit: () => Promise.reject(new Error('the test source does not take commits')),
    merge: async (_repo, base, head, message) => {
      t.merged.push({ base, head, message });
      t.branches[base] = { ...t.branches[base], ...t.branches[head] };
      return commitOf(base);
    },
    checks: async () => ({ state: 'none', runs: [] }),
  };
  return t;
}

/** The test device: memory storage, data: URLs for compiled code, no sealed file and no person. */
export function testDevice(over: Partial<Device> = {}): Device {
  return {
    keep: memoryKeep(),
    storage: memoryStorage(),
    url: (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`,
    load: (url) => import(/* @vite-ignore */ url),
    sealedFile: () => Promise.resolve(null),
    askPassword: () => Promise.resolve(),
    restart: () => undefined,
    ...over,
  };
}

export interface TreeOptions extends Partial<Omit<Device, 'keep'>> {
  keep?: KernelKeep;
  /** This device's settings before it boots. */
  config?: Partial<Config>;
  access?: Record<string, Access>;
  choose?: Record<string, string>;
  /** The kernel's own providers, given before anything starts. */
  provide?: [AnyContract, object][];
  /** More branches beside main (drafts), path → text. */
  branches?: Record<string, Record<string, string>>;
  safe?: boolean;
}

/** Boots a test device on `files` as the main branch, with every extension in them started. */
export async function startTree(files: Record<string, string>, opts: TreeOptions = {}) {
  const { config, access, choose, provide, branches, safe, ...over } = opts;
  const device = testDevice(over);
  const src = testSource({ main: files, ...branches });
  await device.keep.set('config', {
    ...defaultConfig(`${REPO}@main`),
    ...config,
    access: { ...config?.access, ...access },
    choose: { ...config?.choose, ...choose },
  });
  const booted = await boot(device, {
    source: { provide: src.source },
    defaultSource: `${REPO}@main`,
    shared: { '@pip/kernel': await import('./api.ts'), zod: await import('zod') },
    provide,
    safe,
  });
  return {
    booted,
    src,
    device,
    kernel: booted.kernel,
    storage: device.storage,
    keep: device.keep,
    refused: booted.refused,
    started: booted.started,
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

const ROOT = new URL('../../', import.meta.url);

/** The repo's own source under `dirs` ("contracts", "extensions/notes"), as a tree of strings. */
export async function repoFiles(...dirs: string[]): Promise<Record<string, string>> {
  const { readdir, readFile } = await import('node:fs/promises');
  const out: Record<string, string> = {};
  for (const dir of dirs)
    for (const entry of await readdir(new URL(dir, ROOT), {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!(entry.isFile() && /\.tsx?$/.test(entry.name)) || /\.test\.tsx?$/.test(entry.name))
        continue;
      const abs = new URL(`${entry.parentPath}/${entry.name}`, 'file://');
      const rel = abs.pathname.slice(new URL(ROOT).pathname.length);
      out[rel] = await readFile(abs, 'utf8');
    }
  return out;
}

/** All contracts, the given extensions of the repo, and `extra` fixture files, started. */
export async function startRepo(
  extensions: string[],
  extra: Record<string, string> = {},
  opts: Parameters<typeof startTree>[1] = {},
) {
  const files = await repoFiles('contracts', ...extensions.map((e) => `extensions/${e}`));
  return startTree({ ...files, ...extra }, opts);
}
