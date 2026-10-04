// Running the kernel in tests: the same boot as in the browser (boot.ts), on a test device that stands
// in for one: modules as data: URLs, the kernel's state in memory, and a source made of strings.
// Fixture extensions report what they saw through `out`, the shared module @pip/test, which tests
// read back as `storage`.
import type { SourceV1 } from '@contracts/extensions.source';
import type { Access } from './access.ts';
import { boot, type Device } from './boot.ts';
import { type Config, defaultConfig } from './config.ts';
import type { Suite } from './conformance.ts';
import type { AnyContract } from './contract.ts';
import type { Tree } from './loader.ts';
import { memoryKeep } from './storage.ts';

/** The shared modules tests offer extensions. */
export const SHARED = ['@pip/kernel', 'zod'] as const;

export { memoryKeep };

/** Where fixture extensions write what a test checks: by extension id, then key. */
export function testOut() {
  const m = new Map<string, Map<string, unknown>>();
  const of = (ns: string) => {
    if (!m.has(ns)) m.set(ns, new Map());
    return m.get(ns)!;
  };
  return {
    get: <T = unknown>(ns: string, key: string) =>
      Promise.resolve(of(ns).get(key) as T | undefined),
    set: (ns: string, key: string, value: unknown) => Promise.resolve(void of(ns).set(key, value)),
    list: (ns: string, prefix = '') =>
      Promise.resolve([...of(ns)].filter(([k]) => k.startsWith(prefix)).sort()),
  };
}
export type TestOut = ReturnType<typeof testOut>;

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

/** The test device: the kernel's state in memory, data: URLs for compiled code, no sealed file and
 * no person. */
let devices = 0;

export function testDevice(over: Partial<Device> = {}): Device {
  const device = ++devices;
  return {
    keep: memoryKeep(),
    // Each device its own modules, as each browser tab has: Node caches a module by its URL.
    url: (code) =>
      `data:text/javascript;base64,${Buffer.from(`${code}\n// device ${device}`).toString('base64')}`,
    load: (url) => import(/* @vite-ignore */ url),
    sealedFile: () => Promise.resolve(null),
    askPassword: () => Promise.resolve(),
    restart: () => undefined,
    ...over,
  };
}

export interface TreeOptions extends Partial<Device> {
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
  const out = testOut();
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
    shared: {
      '@pip/kernel': await import('./api.ts'),
      zod: await import('zod'),
      '@pip/test': { out },
    },
    provide,
    safe,
  });
  return {
    booted,
    src,
    device,
    kernel: booted.kernel,
    storage: out,
    keep: booted.keep,
    refused: booted.refused,
    started: booted.started,
  };
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

/** The repo's contracts and every extension in it, started; with each contract that has a
 * conformance suite (contracts/<name>/conformance.ts), the suite and the extensions providing it. */
export async function repoConformance() {
  const files = await repoFiles('contracts', 'extensions');
  // The suites call personal methods (answering a question) as a person would.
  const r = await startTree(files, { presence: { grant() {}, take: () => true } });
  const suites: { suite: Suite<unknown>; contract: AnyContract; providers: string[] }[] = [];
  for (const path of Object.keys(files).sort()) {
    const name = /^contracts\/([^/]+)\/conformance\.ts$/.exec(path)?.[1];
    if (!name) continue;
    const suite = (await import(/* @vite-ignore */ new URL(path, ROOT).href))
      .default as Suite<unknown>;
    const exports = await import(
      /* @vite-ignore */ new URL(`contracts/${name}/index.ts`, ROOT).href
    );
    const contract = Object.values(exports).find(
      (c) =>
        (c as AnyContract | undefined)?.kind === 'contract' &&
        (c as AnyContract).key === suite.contract,
    ) as AnyContract;
    const providers = r.kernel
      .running()
      .filter((x) => Object.values(x.statics.provides).some((c) => c.key === suite.contract))
      .map((x) => x.id);
    suites.push({ suite, contract, providers });
  }
  return { ...r, suites };
}
