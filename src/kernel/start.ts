// Starting the app in the browser: the source provider first (source-github, bundled; or the working
// tree under `npm run dev`), then every extension at the chosen commit with this device's drafts on
// top, planned, loaded into this page and started. Safe mode takes over when asked for (?safe), when no
// shell started, or when starting failed outright; it depends on no extension.
import { type SourceV1, source } from '@contracts/extensions.source';
import { kernel as kernelContract } from '@contracts/kernel';
import { type ConfigStore, configStore } from './config.ts';
import { control } from './control.ts';
import { overlay, review } from './drafts.ts';
import { idbKeep } from './idb.ts';
import { Kernel } from './kernel.ts';
import { extensionsIn, planAll, planner, type Stats, type Tree } from './loader.ts';
import type { Refused } from './resolve.ts';
import { presence } from './presence.ts';
import { safeMode } from './safe-mode.ts';
import { singleTab, standbyScreen } from './single-tab.ts';
import { type KernelKeep, type SecretStore, secretStore } from './secrets.ts';
import { SHARED } from './shared.ts';
import { idbStorage } from './storage.ts';
import { unlockScreen } from './unlock-screen.ts';
import { unsealer } from './unseal.ts';

export interface StartOptions {
  /** The bundled extensions' source, with the contracts they import: path → text. */
  bundledSource: Record<string, string>;
  bundled: string[];
  /** `owner/repo@ref` unless this device chose otherwise. */
  defaultSource: string;
  /** The modules extensions import by name, as the kernel bundle has them. */
  shared: Record<string, object>;
  /** Under `npm run dev`: the working tree instead of a repo. */
  devSource?: SourceV1;
}

export interface State {
  config: ConfigStore;
  keep: KernelKeep;
  secrets: SecretStore;
  kernel: Kernel;
  bundled: string[];
  src?: SourceV1;
  commit?: string;
  /** Every extension folder at the commit (with drafts), and which ones came from a draft. */
  found: string[];
  origins: Map<string, string>;
  stats?: Stats;
  refused: Refused[];
  error?: string;
}

const SHELL = 'ui.shell@1';

export async function start(opts: StartOptions) {
  // One tab at a time has the kernel; this one waits until the person moves Vaulter here.
  const tab = singleTab();
  if (!(await tab.claim())) {
    const moved = sessionStorage.getItem('pip-moved') === '1';
    sessionStorage.removeItem('pip-moved');
    await standbyScreen(tab, moved);
  }

  const keep = idbKeep();
  const secrets = secretStore(keep);
  const config = await configStore(keep, opts.defaultSource);
  const kernel = new Kernel({
    shared: opts.shared,
    url: (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })),
    load: (url) => import(/* @vite-ignore */ url),
    secrets,
    storage: idbStorage(),
    keep,
    access: () => config.get().access,
    presence: presence(() => navigator.userActivation?.isActive === true),
  });
  // An error nothing caught is kept under the extension whose code threw it (its stack says).
  addEventListener('error', (e) => kernel.errors.uncaught(e.error));
  addEventListener('unhandledrejection', (e) => kernel.errors.uncaught(e.reason));
  await kernel.errors.load();
  // Another tab asked for Vaulter: stop every extension, hand over, and wait here.
  tab.onTakeOver(async () => {
    await kernel.dispose();
    sessionStorage.setItem('pip-moved', '1');
    setTimeout(() => location.reload(), 50);
  });

  const s: State = {
    config,
    keep,
    secrets,
    kernel,
    bundled: opts.bundled,
    found: [],
    origins: new Map(),
    refused: [],
  };
  const wantSafe = new URLSearchParams(location.search).has('safe');

  // Sealed secrets in the page (secrets.json): imported on their own once this device has the key;
  // otherwise asked for once, before anything starts.
  const sealed = unsealer(keep, secrets);
  const sealedState = await sealed.check(async () =>
    (await fetch(new URL('secrets.json', location.href), { cache: 'no-cache' })).json(),
  );
  if (sealedState === 'locked' && !wantSafe) await unlockScreen(sealed);

  try {
    if (opts.devSource) kernel.provide(source, opts.devSource);
    else {
      const boot = await bundledTree(opts.bundledSource);
      const { plans, refused } = await planAll(boot, {
        read: (p) => Promise.resolve(opts.bundledSource[p]),
        shared: SHARED,
      });
      const started = await kernel.start(plans);
      s.refused.push(...refused, ...started.refused);
    }
    const src = kernel.use(source);
    s.src = src;

    const { repo, ref, pin } = config.get();
    const main = await treeAt(s, src, pin ?? ref, !!pin);
    const drafts = await Promise.all(
      config.get().drafts.map(async (branch) => ({ branch, tree: await treeAt(s, src, branch) })),
    );
    const { tree, origins } = overlay(main, drafts);
    s.commit = tree.commit;
    s.origins = origins;
    s.found = [...extensionsIn(tree).keys()].filter((id) => !opts.bundled.includes(id));

    const deps = {
      read: (path: string, sha: string) => src.read(repo, path, sha),
      keep,
      shared: SHARED,
    };
    kernel.provide(
      kernelContract,
      control({
        kernel,
        config,
        secrets,
        bundled: opts.bundled,
        found: () => s.found,
        origins: () => s.origins,
        commit: () => s.commit ?? '',
        source: () => s.src,
        review: (branch) =>
          review(
            {
              src,
              repo,
              ref,
              treeAt: (commit) => treeAt(s, src, commit, true),
              inspect: async (id, t, entry) =>
                (await kernel.inspect(id, await planner(t, { ...deps }).plan(entry))).statics,
            },
            branch,
          ),
        restart: () => location.reload(),
        sealed,
      }),
    );
    if (wantSafe) return safeMode(s);

    const skip = new Set([...config.get().disabled, ...opts.bundled]);
    const { plans, refused, stats, planner: p } = await planAll(tree, deps, skip);
    s.stats = stats;
    s.refused.push(...refused);
    const started = await kernel.start(plans, {
      choose: config.get().choose,
      conformance: (c) => {
        const path = `contracts/${c.name}/conformance.ts`;
        return tree.files.has(path) ? p.plan(path) : Promise.resolve(null);
      },
    });
    s.refused.push(...started.refused);
    const shell = kernel
      .running()
      .some((r) => Object.values(r.statics.provides).some((c) => c.key === SHELL));
    if (!shell) {
      s.error = 'No shell is installed, so there is nothing to show yet.';
      return safeMode(s);
    }
  } catch (e) {
    s.error = (e as Error).message;
    return safeMode(s);
  }
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
async function treeAt(s: State, src: SourceV1, ref: string, isCommit = false): Promise<Tree> {
  const { repo } = s.config.get();
  const last = `last:${repo}@${ref}`;
  try {
    const commit = isCommit ? ref : await src.head(repo, ref);
    const key = `tree:${repo}:${commit}`;
    const cached = await s.keep.get<[string, string][]>(key);
    const files =
      cached ?? (await src.tree(repo, commit)).map((f) => [f.path, f.sha] as [string, string]);
    if (!cached && commit !== 'working-tree') await s.keep.set(key, files);
    await s.keep.set(last, commit);
    return { commit, files: new Map(files) };
  } catch (e) {
    const commit = await s.keep.get<string>(last);
    const files = commit && (await s.keep.get<[string, string][]>(`tree:${repo}:${commit}`));
    if (!(commit && files)) throw e;
    return { commit, files: new Map(files) };
  }
}
