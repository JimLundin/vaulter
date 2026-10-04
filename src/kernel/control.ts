// The kernel contract's implementation (contracts/kernel): what the extensions list, settings, review
// screen and approvals are built on. Changes go to the device's config and take effect on the next
// start, except approvals and access, which apply at once.
import type { SourceV1 } from '@contracts/extensions.source';
import type { ExtensionInfo, KernelV1, Review } from '@contracts/kernel';
import type { ConfigStore } from './config.ts';
import type { Kernel } from './kernel.ts';
import type { SecretStore } from './secrets.ts';
import type { Unsealer } from './unseal.ts';
import { KERNEL_API } from './version.ts';

export interface ControlEnv {
  kernel: Kernel;
  config: ConfigStore;
  secrets: SecretStore;
  /** Extensions shipped in the kernel bundle. */
  bundled: string[];
  /** Every extension folder at the loaded commit, and which ones came from a draft. */
  found: () => string[];
  origins: () => Map<string, string>;
  commit: () => string;
  source: () => SourceV1 | undefined;
  review: (branch: string) => Promise<Review>;
  restart: () => void;
  sealed?: Unsealer;
}

export function control(env: ControlEnv): KernelV1 {
  const { kernel, config, secrets } = env;
  const src = () => {
    const s = env.source();
    if (!s) throw new Error('no source provider is running');
    return s;
  };

  return {
    async extensions() {
      const running = new Set(kernel.running().map((r) => r.id));
      const problems = kernel.problems();
      const { disabled } = config.get();
      const ids = [...new Set([...env.bundled, ...env.found(), ...kernel.seen.keys()])].sort();
      return Promise.all(
        ids.map(async (id): Promise<ExtensionInfo> => {
          const s = kernel.seen.get(id);
          return {
            id,
            version: s?.version,
            status: running.has(id) ? 'running' : disabled.includes(id) ? 'off' : 'refused',
            problems: problems.get(id) ?? [],
            bundled: env.bundled.includes(id),
            draft: env.origins().get(id),
            requires: Object.values(s?.requires ?? {}).map((c) => c.key),
            optional: Object.values(s?.optional ?? {}).map((c) => c.key),
            provides: Object.values(s?.provides ?? {}).map((c) => c.key),
            permissions: s?.permissions ?? { device: [], network: [] },
            secrets: await Promise.all(
              Object.entries(s?.secrets ?? {}).map(async ([name, x]) => ({
                name,
                label: x.label,
                hosts: x.hosts,
                set: await secrets.has(id, name),
              })),
            ),
            agentGuide: s?.agentGuide ?? '',
            author: s?.author ?? { kind: 'person' },
            kernel: s?.kernel ?? '',
            errors: kernel.errors.of(id).slice(-5),
            failing: kernel.errors.failing(id),
          };
        }),
      );
    },
    source: () => {
      const c = config.get();
      return Promise.resolve({
        repo: c.repo,
        ref: c.ref,
        pin: c.pin,
        commit: env.commit(),
        kernelApi: KERNEL_API,
        drafts: c.drafts,
      });
    },
    access: () => {
      const settings = config.get().access;
      return Promise.resolve(
        [...kernel.policy.known.values()].map((k) => ({
          ...k,
          setting: settings[`${k.ext}/${k.label}`],
        })),
      );
    },
    approvals: () => Promise.resolve(kernel.policy.approvals()),
    onApprovals: (handler) => Promise.resolve(kernel.policy.onApprovals(handler) as () => void),
    audit: (limit) => kernel.policy.audit(limit),
    async drafts() {
      const c = config.get();
      const refs = (await src().refs(c.repo)).filter((r) => r.startsWith('draft/'));
      const origins = env.origins();
      return refs.map((branch) => ({
        branch,
        extensions: [...origins].filter(([, b]) => b === branch).map(([id]) => id),
        loaded: c.drafts.includes(branch),
      }));
    },
    review: (branch) => env.review(branch),
    errors: (id) => Promise.resolve(kernel.errors.of(id)),

    decide: (id, approve) => Promise.resolve(kernel.policy.decide(id, approve)),
    setAccess: (ext, label, access) =>
      config.update((c) => {
        const next = { ...c.access };
        if (access === null) delete next[`${ext}/${label}`];
        else next[`${ext}/${label}`] = access;
        return { ...c, access: next };
      }),
    async setEnabled(id, on) {
      await config.update((c) => ({
        ...c,
        disabled: on ? c.disabled.filter((x) => x !== id) : [...new Set([...c.disabled, id])],
      }));
      // Now, too: off stops it (and what requires it); on starts it, and what stopped with it.
      if (!on) await kernel.stop(id);
      else if (!kernel.running().some((r) => r.id === id)) await kernel.reload([id]);
    },
    async remove(id) {
      await kernel.remove(id);
      await config.update((c) => ({ ...c, disabled: [...new Set([...c.disabled, id])] }));
    },
    setSecret: (ext, name, value) => secrets.set(ext, name, value),
    forgetSecret: (ext, name) => secrets.forget(ext, name),
    setSource: (change) =>
      config.update((c) => ({
        ...c,
        repo: change.repo ?? c.repo,
        ref: change.ref ?? c.ref,
        pin: change.pin === null ? undefined : (change.pin ?? c.pin),
      })),
    tryDraft: (branch, on) =>
      config.update((c) => ({
        ...c,
        drafts: on ? [...new Set([...c.drafts, branch])] : c.drafts.filter((b) => b !== branch),
      })),
    async accept(branch, message) {
      const c = config.get();
      const sha = await src().merge(c.repo, c.ref, branch, message ?? `Accept ${branch}`);
      await config.update((x) => ({ ...x, drafts: x.drafts.filter((b) => b !== branch) }));
      return sha;
    },
    restart: () => Promise.resolve(env.restart()),
    sealed: () => Promise.resolve({ present: env.sealed?.present() ?? false }),
    async unlock(password) {
      if (!env.sealed) throw new Error('there is no sealed file');
      await env.sealed.unlock(password);
    },
  };
}
