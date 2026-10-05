// Boot: from a device and the page's own extensions to a running kernel, or to safe mode with a
// reason (ARCHITECTURE.md, "Extension lifecycle"). Main is what this page was built with; a source
// provider (source-github), when one runs, adds a pinned commit or this device's drafts on top.
// Every extension is planned, loaded into the page and started. The device is a browser (start.ts); tests boot the same way on a test device.
import { type SourceV1, source } from '@contracts/extensions.source';
import { kernel as kernelContract } from '@contracts/kernel';
import { type ConfigStore, configStore } from './config.ts';
import type { AnyContract } from './contract.ts';
import { control } from './control.ts';
import { overlay, review } from './drafts.ts';
import { Kernel } from './kernel.ts';
import {
  extensionsIn,
  type LoaderDeps,
  planAll,
  planner,
  type Stats,
  type Tree,
} from './loader.ts';
import type { Statics } from './extension.ts';
import type { Presence } from './presence.ts';
import type { Refused } from './resolve.ts';
import type { KernelKeep } from './storage.ts';

/** What differs between devices: a browser, or the test device that stands in for one. */
export interface Device {
  /** The kernel's own state: settings, trees and compiled output, its logs. */
  keep: KernelKeep;
  /** A module URL for compiled code, and loading it. */
  url: (code: string) => string;
  load: (url: string) => Promise<Record<string, unknown>>;
  presence?: Presence;
  restart: () => void;
  /** Told the kernel as soon as it exists, before anything starts: for errors nothing caught. */
  watch?: (kernel: Kernel) => void;
}

export interface BootOptions {
  /** Main: the extensions and contracts this page was built with (the working tree under `npm run
   * dev`), path → text, and the commit they are from. */
  page: { commit: string; files: Record<string, string> };
  /** `owner/repo@ref`: where a source provider finds drafts and older commits, unless this device
   * chose otherwise. */
  defaultSource: string;
  /** The modules extensions import by name, by specifier. */
  shared: Record<string, object>;
  /** Safe mode was asked for (?safe): provide the kernel contract and start nothing. */
  safe?: boolean;
  /** More contracts the kernel provides itself, before anything starts (a test's fakes). */
  provide?: [AnyContract, object][];
}

export interface Booted {
  kernel: Kernel;
  config: ConfigStore;
  keep: KernelKeep;
  /** The source provider, when one is running: drafts and pinned commits come through it. */
  src?: SourceV1;
  commit?: string;
  /** Every extension folder at the commit (with drafts), and which ones came from a draft. */
  found: string[];
  origins: Map<string, string>;
  stats?: Stats;
  refused: Refused[];
  started: string[];
  /** Set when safe mode should take over: asked for, no shell started, or starting failed. */
  safe?: { reason?: string };
}

const SHELL = 'ui.shell@1';

export async function boot(device: Device, opts: BootOptions): Promise<Booted> {
  const { keep } = device;
  const config = await configStore(keep, opts.defaultSource);
  const kernel = new Kernel({
    shared: opts.shared,
    url: device.url,
    load: device.load,
    keep,
    access: () => config.get().access,
    presence: device.presence,
  });
  device.watch?.(kernel);
  await kernel.errors.load();

  const b: Booted = {
    kernel,
    config,
    keep,
    found: [],
    origins: new Map(),
    refused: [],
    started: [],
  };
  const shared = Object.keys(opts.shared);
  try {
    for (const [c, impl] of opts.provide ?? []) kernel.provide(c, impl);
    const page = await pageTree(opts.page);
    const { repo, ref, pin, drafts, disabled } = config.get();
    const deps: LoaderDeps = {
      read: (path, sha) => {
        const text = page.texts.get(sha);
        return text === undefined ? need(b.src).read(repo, path, sha) : Promise.resolve(text);
      },
      keep,
      shared,
    };
    const skip = new Set(disabled);

    b.commit = page.tree.commit;
    b.found = [...extensionsIn(page.tree).keys()];
    kernel.provide(
      kernelContract,
      control({
        booted: b,
        restart: device.restart,
        review: (branch) =>
          review(
            {
              src: need(b.src),
              repo,
              ref,
              treeAt: (commit) => treeAt(keep, need(b.src), repo, commit, true),
              inspect: async (id, t, entry) =>
                (await kernel.inspect(id, await planner(t, deps).plan(entry))).statics,
            },
            branch,
          ),
      }),
    );
    if (opts.safe) {
      b.safe = {};
      return b;
    }

    // Main is this page's own. A pinned commit or a draft needs a source provider: the extension
    // providing extensions.source starts first, with what it requires, and the rest after.
    let { tree } = page;
    if (pin || drafts.length) {
      const first = await startSource(kernel, page.tree, deps, skip);
      b.refused.push(...first.refused);
      b.started.push(...first.started);
      b.src = running(kernel);
      if (pin) tree = await treeAt(keep, need(b.src, 'a pinned commit'), repo, pin, true);
      if (drafts.length && !b.src)
        b.refused.push({ id: 'drafts', problems: ['no source provider is running'] });
      else if (drafts.length) {
        const src = b.src!;
        const trees = await Promise.all(
          drafts.map(async (branch) => {
            try {
              return { branch, tree: await treeAt(keep, src, repo, branch) };
            } catch (e) {
              b.refused.push({ id: branch, problems: [(e as Error).message] });
            }
          }),
        );
        const overlaid = overlay(
          tree,
          trees.filter((t) => t !== undefined),
        );
        ({ tree, origins: b.origins } = overlaid);
      }
      b.commit = tree.commit;
      b.found = [...extensionsIn(tree).keys()];
      for (const id of b.started) skip.add(id);
    } else b.src = running(kernel);

    const { plans, refused, stats } = await planAll(tree, deps, skip);
    b.stats = stats;
    b.refused.push(...refused);
    const started = await kernel.start(plans);
    b.refused.push(...started.refused);
    b.started.push(...started.started);
    b.src ??= running(kernel);
    const shell = kernel
      .running()
      .some((r) => Object.values(r.statics.provides).some((c) => c.key === SHELL));
    if (!shell) b.safe = { reason: 'No shell is installed, so there is nothing to show yet.' };
  } catch (e) {
    b.safe = { reason: (e as Error).message };
  }
  return b;
}

const need = (src: SourceV1 | undefined, what = 'this') => {
  if (!src) throw new Error(`${what} needs a source provider (source-github), and none is running`);
  return src;
};

const running = (kernel: Kernel) => {
  try {
    return kernel.use(source);
  } catch {
    // Nothing running provides it.
  }
};

/** The extensions providing extensions.source, with everything they require, started from `tree`. */
async function startSource(kernel: Kernel, tree: Tree, deps: LoaderDeps, skip: Set<string>) {
  if (running(kernel)) return { started: [], refused: [] };
  const { plans, refused } = await planAll(tree, deps, skip);
  const statics = new Map<string, Statics>();
  for (const [id, plan] of plans)
    try {
      statics.set(id, (await kernel.inspect(id, plan)).statics);
    } catch {
      // Refused, with its reason, when everything else starts.
    }
  const providers = (key: string) =>
    [...statics]
      .filter(([, s]) => Object.values(s.provides).some((c) => c.key === key))
      .map(([id]) => id);
  const want = new Set(providers(source.key));
  for (const id of want)
    for (const c of Object.values(statics.get(id)!.requires))
      for (const p of providers(c.key)) want.add(p);
  const started = await kernel.start(new Map([...plans].filter(([id]) => want.has(id))));
  return { started: started.started, refused: [...refused, ...started.refused] };
}

/** A file's git blob sha: what a git host's trees give, so the page's files and a source provider's
 * compare file by file and share compiled output. */
export async function blobSha(text: string) {
  const enc = new TextEncoder();
  const body = enc.encode(text);
  const head = enc.encode(`blob ${body.length}\0`);
  const bytes = new Uint8Array(head.length + body.length);
  bytes.set(head);
  bytes.set(body, head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

/** The page's own files as a tree, and their text by sha. */
async function pageTree(page: BootOptions['page']) {
  const texts = new Map<string, string>();
  const files = new Map<string, string>();
  await Promise.all(
    Object.entries(page.files).map(async ([path, text]) => {
      const sha = await blobSha(text);
      files.set(path, sha);
      texts.set(sha, text);
    }),
  );
  return { tree: { commit: page.commit, files } satisfies Tree, texts };
}

/** The tree at `ref` (or the commit itself); offline, the last one this device loaded for it. */
async function treeAt(
  keep: KernelKeep,
  src: SourceV1,
  repo: string,
  ref: string,
  isCommit = false,
): Promise<Tree> {
  const last = `last:${repo}@${ref}`;
  try {
    const commit = isCommit ? ref : await src.head(repo, ref);
    const key = `tree:${repo}:${commit}`;
    const cached = await keep.get<[string, string][]>(key);
    const files =
      cached ?? (await src.tree(repo, commit)).map((f) => [f.path, f.sha] as [string, string]);
    if (!cached && commit !== 'working-tree') await keep.set(key, files);
    await keep.set(last, commit);
    return { commit, files: new Map(files) };
  } catch (e) {
    const commit = await keep.get<string>(last);
    const files = commit && (await keep.get<[string, string][]>(`tree:${repo}:${commit}`));
    if (!(commit && files)) throw e;
    return { commit, files: new Map(files) };
  }
}
