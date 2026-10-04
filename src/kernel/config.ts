// What this device loads and allows, kept by the kernel and changed only through the kernel contract
// (by a person) or in safe mode. Never synced: each device chooses its own drafts and pins.
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

export interface ConfigStore {
  get: () => Config;
  update: (change: (c: Config) => Config) => Promise<void>;
}

export async function configStore(keep: KernelKeep, fallback: string): Promise<ConfigStore> {
  let config = { ...defaultConfig(fallback), ...(await keep.get<Partial<Config>>('config')) };
  return {
    get: () => config,
    async update(change) {
      config = change(config);
      await keep.set('config', config);
    },
  };
}
