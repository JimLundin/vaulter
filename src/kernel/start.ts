// Starting the app in the browser: the bootstrap source provider first, then every extension in the
// repo at the chosen commit, compiled and booted. Safe mode takes over when asked for (?safe), when no
// shell started, or when starting failed outright; it depends on no extension.
import { type SourceV1, source } from '@contracts/extensions.source';
import { type Extension, Statics } from './extension.ts';
import { idbKeep } from './idb.ts';
import { boot, connect, type Booted, type Running } from './kernel.ts';
import { type Loaded, load, type Tree } from './loader.ts';
import type { Refused } from './resolve.ts';
import { safeMode } from './safe-mode.ts';
import { type KernelKeep, type SecretStore, secretStore } from './secrets.ts';

/** What this device loads, kept by the kernel and changed only in safe mode. */
export interface Config {
  repo: string;
  ref: string;
  /** A commit to stay on instead of `ref`'s latest: a rollback. */
  pin?: string;
  disabled: string[];
  /** Contract key → extension id, where two extensions provide the same contract. */
  choose: Record<string, string>;
}

export interface State {
  config: Config;
  keep: KernelKeep;
  secrets: SecretStore;
  bootstrap: Running[];
  src?: SourceV1;
  commit?: string;
  /** Every extension folder at the commit. */
  found: string[];
  /** Static fields of every extension that compiled, for its secrets. */
  statics: Statics[];
  loaded?: Loaded;
  booted?: Booted;
  refused: Refused[];
  error?: string;
}

const SHELL = 'ui.shell@1';

export function defaultConfig(spec: string): Config {
  const [repo, ref = 'main'] = spec.split('@');
  return { repo, ref, disabled: [], choose: {} };
}

export async function start(opts: {
  bootstrap: Extension[];
  /** Every extension the kernel bundle ships, active or not: never loaded from the repo. */
  bundled: string[];
  shared: Record<string, object>;
  defaultSource: string;
}) {
  const keep = idbKeep();
  const secrets = secretStore(keep);
  const config = (await keep.get<Config>('config')) ?? defaultConfig(opts.defaultSource);
  const s: State = { config, keep, secrets, bootstrap: [], found: [], statics: [], refused: [] };
  const wantSafe = new URLSearchParams(location.search).has('safe');

  try {
    const b = await boot(
      opts.bootstrap.map((ext) => ({ origin: 'kernel bundle', ext })),
      { secrets },
    );
    s.bootstrap = b.running;
    s.refused.push(...b.refused);
    if (!b.running[0]) throw new Error('the bootstrap source provider did not start');
    s.src = connect(b.running[0], source, 'kernel');

    const tree = await treeAt(s, s.src);
    s.commit = tree.commit;
    s.found = [...new Set([...tree.files.keys()].map((p) => /^extensions\/([^/]+)\//.exec(p)?.[1]))]
      .filter((x): x is string => !!x)
      .filter((id) => !opts.bundled.includes(id));
    if (wantSafe) return safeMode(s);

    const src = s.src;
    s.loaded = await load(
      tree,
      {
        read: (path, sha) => src.read(config.repo, path, sha),
        keep,
        shared: opts.shared,
        url: (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })),
        load: (url) => import(/* @vite-ignore */ url),
      },
      new Set([...config.disabled, ...opts.bundled]),
    );
    s.refused.push(...s.loaded.refused);
    s.statics = s.loaded.candidates.flatMap((c) => {
      const parsed = Statics.safeParse((c.ext as Extension | undefined)?.def);
      return parsed.success ? [parsed.data] : [];
    });
    s.booted = await boot(s.loaded.candidates, {
      secrets,
      started: s.bootstrap,
      choose: config.choose,
    });
    s.refused.push(...s.booted.refused);
    if (!s.booted.running.some((r) => r.provided.has(SHELL))) {
      s.error = 'No shell started, so there is nothing to show.';
      return safeMode(s);
    }
  } catch (e) {
    s.error = (e as Error).message;
    return safeMode(s);
  }
}

/** The tree at the pinned commit or the ref's latest; offline, the last one this device loaded. */
async function treeAt(s: State, src: SourceV1): Promise<Tree> {
  const { repo, ref, pin } = s.config;
  const last = `last:${repo}@${pin ?? ref}`;
  try {
    const commit = pin ?? (await src.head(repo, ref));
    const cached = await s.keep.get<[string, string][]>(`tree:${repo}:${commit}`);
    const files =
      cached ?? (await src.tree(repo, commit)).map((f) => [f.path, f.sha] as [string, string]);
    if (!cached && commit !== 'working-tree') await s.keep.set(`tree:${repo}:${commit}`, files);
    await s.keep.set(last, commit);
    return { commit, files: new Map(files) };
  } catch (e) {
    const commit = await s.keep.get<string>(last);
    const files = commit && (await s.keep.get<[string, string][]>(`tree:${repo}:${commit}`));
    if (!(commit && files)) throw e;
    return { commit, files: new Map(files) };
  }
}
