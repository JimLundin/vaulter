// What this device loads and allows, kept by the kernel and changed only through the kernel contract
// (by a person) or in safe mode, both through the operations here. Never synced: each device chooses
// its own drafts and pins.
import type { Access } from './access.ts';
import type { KernelKeep } from './secrets.ts';

export interface Config {
  repo: string;
  ref: string;
  /** A commit to stay on instead of `ref`'s latest: a rollback. */
  pin?: string;
  disabled: string[];
  /** Contract key → extension id, where two extensions provide the same contract. */
  choose: Record<string, string>;
  /** The person's access settings, by `extension/label`. */
  access: Record<string, Access>;
  /** Draft branches loaded on top of `ref`. */
  drafts: string[];
}

export function defaultConfig(spec: string): Config {
  const [repo, ref = 'main'] = spec.split('@');
  return { repo, ref, disabled: [], choose: {}, access: {}, drafts: [] };
}

export interface SourceChange {
  repo?: string;
  ref?: string;
  /** A commit to stay on; null for the branch's latest. */
  pin?: string | null;
}

export interface ConfigStore {
  get: () => Config;
  setEnabled: (id: string, on: boolean) => Promise<void>;
  tryDraft: (branch: string, on: boolean) => Promise<void>;
  setSource: (change: SourceChange) => Promise<void>;
  /** The person's level for one of an extension's guarded functions; null for the declared one. */
  setAccess: (ext: string, label: string, access: Access | null) => Promise<void>;
  /** Which extension provides a contract two extensions provide; null to choose none. */
  choose: (key: string, id: string | null) => Promise<void>;
}

const toggle = (list: string[], x: string, on: boolean) =>
  on ? [...new Set([...list, x])] : list.filter((y) => y !== x);

const without = <V>(m: Record<string, V>, k: string) => {
  const { [k]: _, ...rest } = m;
  return rest;
};

export async function configStore(keep: KernelKeep, fallback: string): Promise<ConfigStore> {
  let config = { ...defaultConfig(fallback), ...(await keep.get<Partial<Config>>('config')) };
  const update = async (change: (c: Config) => Config) => {
    config = change(config);
    await keep.set('config', config);
  };
  return {
    get: () => config,
    setEnabled: (id, on) => update((c) => ({ ...c, disabled: toggle(c.disabled, id, !on) })),
    tryDraft: (branch, on) => update((c) => ({ ...c, drafts: toggle(c.drafts, branch, on) })),
    setSource: (change) =>
      update((c) => ({
        ...c,
        repo: change.repo || c.repo,
        ref: change.ref || c.ref,
        pin: change.pin === null ? undefined : (change.pin ?? c.pin),
      })),
    setAccess: (ext, label, access) =>
      update((c) => {
        const k = `${ext}/${label}`;
        return {
          ...c,
          access: access === null ? without(c.access, k) : { ...c.access, [k]: access },
        };
      }),
    choose: (key, id) =>
      update((c) => ({
        ...c,
        choose: id === null ? without(c.choose, key) : { ...c.choose, [key]: id },
      })),
  };
}
