// Boot: from a device and a source of extensions to a running kernel, or to safe mode with a reason
// (ARCHITECTURE.md, "Extension lifecycle"). The source provider comes first (source-github from the
// kernel bundle, or one the kernel provides itself), then every extension at the chosen commit with
// this device's drafts on top: planned, loaded into the page and started. The device is a browser (start.ts); tests boot the same way on a test device.
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
import type { Presence } from './presence.ts';
import type { Refused } from './resolve.ts';
import { type KernelKeep, type SecretStore, secretStore } from './secrets.ts';
import type { KernelStorage } from './storage.ts';
import { type Unsealer, unsealer } from './unseal.ts';

/** What differs between devices: a browser, or the test device that stands in for one. */
export interface Device {
  /** The kernel's own state: settings, secrets, trees and compiled output. */
  keep: KernelKeep;
  /** Every extension's storage. */
  storage: KernelStorage;
  /** The secret store; by default one over `keep`. */
  secrets?: SecretStore;
  /** A module URL for compiled code, and loading it. */
  url: (code: string) => string;
  load: (url: string) => Promise<Record<string, unknown>>;
  presence?: Presence;
  fetch?: typeof fetch;
  /** The page's sealed secrets file (secrets.json), or anything else when there is none. */
  sealedFile: () => Promise<unknown>;
  /** Asks the person for the sealed secrets' password; resolves once unlocked or put off. */
  askPassword: (sealed: Unsealer) => Promise<void>;
  restart: () => void;
  /** Told the kernel as soon as it exists, before anything starts: for errors nothing caught. */
  watch?: (kernel: Kernel) => void;
}

export type BootSource =
  /** Extensions shipped in the kernel bundle, one of them the source provider: path → text. */
  | { bundled: Record<string, string>; ids: string[] }
  /** A source the kernel provides itself: the working tree under `npm run dev`, or a test's. */
  | { provide: SourceV1 };

export interface BootOptions {
  source: BootSource;
  /** `owner/repo@ref` unless this device chose otherwise. */
  defaultSource: string;
  /** The modules extensions import by name, by specifier. */
  shared: Record<string, object>;
  /** Safe mode was asked for (?safe): start the source and the kernel contract, nothing else. */
  safe?: boolean;
  /** More contracts the kernel provides itself, before anything starts (a test's fakes). */
  provide?: [AnyContract, object][];
}

export interface Booted {
  kernel: Kernel;
  config: ConfigStore;
  keep: KernelKeep;
  secrets: SecretStore;
  sealed: Unsealer;
  /** Extensions shipped in the kernel bundle. */
  bundled: string[];
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
  const secrets = device.secrets ?? secretStore(keep);
  const config = await configStore(keep, opts.defaultSource);
  const kernel = new Kernel({
    shared: opts.shared,
    url: device.url,
    load: device.load,
    secrets,
    storage: device.storage,
    access: () => config.get().access,
    presence: device.presence,
    fetch: device.fetch,
  });
  device.watch?.(kernel);
  await kernel.errors.load();

  const sealed = unsealer(keep, secrets);
  const b: Booted = {
    kernel,
    config,
    keep,
    secrets,
    sealed,
    bundled: 'bundled' in opts.source ? opts.source.ids : [],
    found: [],
    origins: new Map(),
    refused: [],
    started: [],
  };
  // Sealed secrets in the page: imported on their own once this device has the key; otherwise
  // asked for once, before anything starts.
  if ((await sealed.check(device.sealedFile)) === 'locked' && !opts.safe)
    await device.askPassword(sealed);

  const shared = Object.keys(opts.shared);
  try {
    for (const [c, impl] of opts.provide ?? []) kernel.provide(c, impl);
    if ('provide' in opts.source) kernel.provide(source, opts.source.provide);
    else {
      const files = opts.source.bundled;
      const { plans, refused } = await planAll(await bundledTree(files), {
        read: (p) => Promise.resolve(files[p]),
        shared,
      });
      const started = await kernel.start(plans);
      b.refused.push(...refused, ...started.refused);
      b.started.push(...started.started);
    }
    const src = kernel.use(source);
    b.src = src;

    const { repo, ref, pin } = config.get();
    const main = await treeAt(keep, src, repo, pin ?? ref, !!pin);
    const drafts = await Promise.all(
      config
        .get()
        .drafts.map(async (branch) => ({ branch, tree: await treeAt(keep, src, repo, branch) })),
    );
    const { tree, origins } = overlay(main, drafts);
    b.commit = tree.commit;
    b.origins = origins;
    b.found = [...extensionsIn(tree).keys()].filter((id) => !b.bundled.includes(id));

    const deps: LoaderDeps = { read: (path, sha) => src.read(repo, path, sha), keep, shared };
    kernel.provide(
      kernelContract,
      control({
        booted: b,
        restart: device.restart,
        review: (branch) =>
          review(
            {
              src,
              repo,
              ref,
              treeAt: (commit) => treeAt(keep, src, repo, commit, true),
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

    const skip = new Set([...config.get().disabled, ...b.bundled]);
    const { plans, refused, stats } = await planAll(tree, deps, skip);
    b.stats = stats;
    b.refused.push(...refused);
    const started = await kernel.start(plans, { choose: config.get().choose });
    b.refused.push(...started.refused);
    b.started.push(...started.started);
    const shell = kernel
      .running()
      .some((r) => Object.values(r.statics.provides).some((c) => c.key === SHELL));
    if (!shell) b.safe = { reason: 'No shell is installed, so there is nothing to show yet.' };
  } catch (e) {
    b.safe = { reason: (e as Error).message };
  }
  return b;
}

/** The bundled source as a tree, each file's sha a hash of its text. */
async function bundledTree(files: Record<string, string>): Promise<Tree> {
  const entries = await Promise.all(
    Object.entries(files).map(async ([p, text]) => [p, await sha1(text)] as [string, string]),
  );
  return { commit: 'kernel-bundle', files: new Map(entries) };
}

const sha1 = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

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
