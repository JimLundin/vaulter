// Running the kernel in tests: the same boot as in the browser (boot.ts), on a test device that stands
// in for one: modules as data: URLs, the kernel's state in memory, and a source made of strings.
// Fixture extensions report what they saw through `out`, the shared module #test, which tests
// read back as `storage`.
import { type SourceV1, source } from '#contracts/extensions.source';
import type { Access } from './access.ts';
import { blobSha, boot, type Device } from './boot.ts';
import { type Config, defaultConfig } from './config.ts';
import type { Suite } from '../../contracts/conformance.ts';
import type { AnyContract } from './contract.ts';
import type { Tree } from './loader.ts';
import { memoryKeep } from './storage.ts';

/** The shared modules tests offer extensions. */
export const SHARED = ['#kernel', 'zod'] as const;

/** Where fixture extensions write what a test checks: by extension id, then key. */
export function testOut() {
  const m = new Map<string, Map<string, unknown>>();
  const of = (ns: string) => {
    let entries = m.get(ns);
    if (!entries) {
      entries = new Map();
      m.set(ns, entries);
    }
    return entries;
  };
  return {
    get: <T = unknown>(ns: string, key: string) =>
      Promise.resolve(of(ns).get(key) as T | undefined),
    set: (ns: string, key: string, value: unknown) => Promise.resolve(void of(ns).set(key, value)),
    list: (ns: string, prefix = '') =>
      Promise.resolve(
        [...of(ns)].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)),
      ),
  };
}

export const treeOf = (files: Record<string, string>, commit = 'test0000'): Tree => ({
  commit,
  files: new Map(Object.keys(files).map((p) => [p, `${p}@${files[p].length}`])),
});

export const REPO = 'o/r';

/** A source over branches of files, each branch one commit: path → text. Set `offline` to make every
 * read of the repo fail, as with no network; `checks` may be replaced. */
export function testSource(branches: Record<string, Record<string, string>>) {
  const t = {
    branches,
    offline: false as boolean,
    source: undefined as unknown as SourceV1,
  };
  const reach = () => {
    if (t.offline) throw new TypeError('Failed to fetch');
  };
  const commitOf = async (ref: string) => {
    const files = t.branches[ref];
    if (!files) throw new Error(`no branch ${ref}`);
    return `${ref.replaceAll('/', '-')}-${(await blobSha(JSON.stringify(files))).slice(0, 8)}`;
  };
  const filesAt = async (commit: string) => {
    for (const ref of Object.keys(t.branches))
      if ((await commitOf(ref)) === commit) return t.branches[ref];
    throw new Error(`no commit ${commit}`);
  };
  t.source = {
    head: async (_repo, ref) => {
      reach();
      return await commitOf(ref);
    },
    tree: async (_repo, commit) => {
      reach();
      const files = await filesAt(commit);
      return Promise.all(
        Object.entries(files).map(async ([path, text]) => ({ path, sha: await blobSha(text) })),
      );
    },
    read: async (_repo, path, sha) => {
      reach();
      for (const files of Object.values(t.branches))
        if (path in files && (await blobSha(files[path])) === sha) return files[path];
      throw new Error(`no ${path} at ${sha}`);
    },
    refs: async () => Object.keys(t.branches),
    checks: async () => ({ state: 'none', runs: [] }),
  };
  return t;
}

/** The test device: the kernel's state in memory, data: URLs for compiled code, and no person. */
let devices = 0;

export function testDevice(over: Partial<Device> = {}): Device {
  const device = ++devices;
  return {
    keep: memoryKeep(),
    // Each device its own modules, as each browser tab has: Node caches a module by its URL.
    url: (code) =>
      `data:text/javascript;base64,${Buffer.from(`${code}\n// device ${device}`).toString('base64')}`,
    load: (url) => import(/* @vite-ignore */ url),
    restart: () => undefined,
    ...over,
  };
}

export interface TreeOptions extends Partial<Device> {
  /** This device's settings before it boots. */
  config?: Partial<Config>;
  access?: Record<string, Access>;
  /** The kernel's own providers, given before anything starts. */
  provide?: [AnyContract, object][];
  /** More branches beside main (drafts), path → text. */
  branches?: Record<string, Record<string, string>>;
  safe?: boolean;
}

/** Boots a test device on `files` as the main branch, with every extension in them started. */
export async function startTree(files: Record<string, string>, opts: TreeOptions = {}) {
  const { config, access, provide, branches, safe, ...over } = opts;
  const device = testDevice(over);
  const out = testOut();
  const src = testSource({ main: files, ...branches });
  await device.keep.set('config', {
    ...defaultConfig(`${REPO}@main`),
    ...config,
    access: { ...config?.access, ...access },
  });
  // Main is the page's (`files`); the test source has it too, with the branches for drafts and pins.
  const booted = await boot(device, {
    page: { commit: await src.source.head(REPO, 'main'), files },
    defaultSource: `${REPO}@main`,
    shared: {
      '#kernel': await import('./api.ts'),
      zod: await import('zod'),
      '#test': { out },
    },
    provide: [[source, src.source], ...(provide ?? [])],
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
  const r = await startTree(files, { presence: { grant: () => undefined, take: () => true } });
  const suites: { suite: Suite<unknown>; contract: AnyContract; providers: string[] }[] = [];
  for (const path of Object.keys(files).sort((a, b) => a.localeCompare(b))) {
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
