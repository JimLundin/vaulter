// What this device loads and allows, kept by the kernel and changed only through the kernel contract
// (by a person) or in safe mode, both through the operations here. Never synced: each device chooses
// its own drafts and pins.
import type { KernelKeep } from './storage.ts';

export interface Config {
  repo: string;
  ref: string;
  /** A commit to stay on instead of `ref`'s latest: a rollback. */
  pin?: string;
  disabled: string[];
  /** Draft branches loaded on top of `ref`. */
  drafts: string[];
}

export function defaultConfig(spec: string): Config {
  const [repo, ref = 'main'] = spec.split('@');
  return { repo, ref, disabled: [], drafts: [] };
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
}

const toggle = (list: string[], x: string, on: boolean) =>
  on ? [...new Set([...list, x])] : list.filter((y) => y !== x);

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
  };
}
