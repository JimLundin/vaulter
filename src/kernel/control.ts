// The kernel contract's implementation (contracts/kernel): what the extensions list, settings, review
// screen and approvals are built on. Changes go to the device's settings (config.ts, the same
// operations safe mode uses) and take effect on the next start, which turning an extension on or off
// starts at once; approvals and access apply as they are.
import type { ExtensionInfo, KernelV1, Review } from '#contracts/kernel';
import type { Booted } from './boot.ts';

export interface ControlEnv {
  /** What boot found and started; read at each call, as boot fills it in. */
  booted: Booted;
  review: (branch: string) => Promise<Review>;
  restart: () => void;
}

export function control({ booted: b, review, restart }: ControlEnv): KernelV1 {
  const { kernel, config } = b;
  const src = () => {
    if (!b.src) throw new Error('no source provider is running');
    return b.src;
  };

  return {
    extensions() {
      const running = new Set(kernel.running().map((r) => r.id));
      // Every refusal of this start, planning's and starting's: boot keeps them all.
      const problems = new Map(b.refused.map((r) => [r.id, r.problems]));
      const { disabled } = config.get();
      const ids = [...new Set([...b.found, ...kernel.seen.keys()])].sort();
      return Promise.resolve(
        ids.map((id): ExtensionInfo => {
          const s = kernel.seen.get(id);
          return {
            id,
            version: s?.version,
            status: running.has(id) ? 'running' : disabled.includes(id) ? 'off' : 'refused',
            problems: problems.get(id) ?? [],
            draft: b.origins.get(id),
            requires: Object.values(s?.requires ?? {}).map((c) => c.key),
            optional: Object.values(s?.optional ?? {}).map((c) => c.key),
            provides: Object.values(s?.provides ?? {}).map((c) => c.key),
            permissions: s?.permissions ?? { device: [], network: [] },
            // Declared; whether each is set is net@1's to say.
            secrets: Object.entries(s?.secrets ?? {}).map(([name, x]) => ({
              name,
              label: x.label,
              hosts: x.hosts,
            })),
            agentGuide: s?.agentGuide ?? '',
            author: s?.author ?? { kind: 'person' },
            errors: kernel.errors.of(id).slice(-5),
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
        commit: b.commit ?? '',
        drafts: c.drafts,
      });
    },
    access: () => {
      const settings = config.get().access;
      return Promise.resolve(
        [...kernel.policy.known.values()].map((k) => ({
          ...k,
          setting: settings[`${k.extension}/${k.label}`],
        })),
      );
    },
    approvals: () => Promise.resolve(kernel.policy.approvals()),
    onApprovals: (handler) => Promise.resolve(kernel.policy.onApprovals(handler) as () => void),
    audit: (limit) => kernel.policy.audit(limit),
    async drafts() {
      const c = config.get();
      // Without a source provider, the drafts this device was told to try are all it knows.
      const refs = b.src
        ? (await b.src.refs(c.repo)).filter((r) => r.startsWith('draft/'))
        : c.drafts;
      const { origins } = b;
      return refs.map((branch) => ({
        branch,
        extensions: [...origins].filter(([, from]) => from === branch).map(([id]) => id),
        loaded: c.drafts.includes(branch),
      }));
    },
    review: (branch) => review(branch),

    decide: (id, approve) => Promise.resolve(kernel.policy.decide(id, approve)),
    setAccess: (ext, label, access) => config.setAccess(ext, label, access),
    // An extension is turned on or off by starting the app again: a page reload, from the cache.
    async setEnabled(id, on) {
      await config.setEnabled(id, on);
      restart();
    },
    async remove(id) {
      await kernel.remove(id);
      await config.setEnabled(id, false);
      restart();
    },
    setSource: (change) => config.setSource(change),
    async tryDraft(branch, on) {
      // CI runs the conformance suites on the draft: one it failed isn't tried here until it passes.
      if (on) {
        const { repo } = config.get();
        const checks = await src()
          .checks(repo, await src().head(repo, branch))
          .catch(() => undefined);
        if (checks?.state === 'failure')
          throw new Error(`${branch} failed CI's checks: it can be tried once they pass`);
      }
      await config.tryDraft(branch, on);
    },
    restart: () => Promise.resolve(restart()),
  };
}
