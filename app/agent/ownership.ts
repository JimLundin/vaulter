import type { NodeStore } from '../vault/nodes/store.ts';
import { canonical } from '../vault/nodes/json.ts';
import type { AgentRun } from './runtime.ts';
import type { PreparedAgentRun } from './store.ts';

interface Owner {
  readonly identity: string;
  readonly handle: AgentRun;
  readonly dispose: () => void;
}

// Local controller evidence only. Different adapters/tabs/devices have no implied lease.
const stores = new WeakMap<NodeStore, Map<string, Owner>>();

export function hasLiveAgentOwner(nodes: NodeStore, run: string): boolean {
  return stores.get(nodes)?.has(run) ?? false;
}

/** Reconcile synchronous starts by run; never queue unrelated execution. */
export function agentOwnership(nodes: NodeStore) {
  const owned = new Map<string, Owner>();
  const active = stores.get(nodes) ?? new Map<string, Owner>();
  stores.set(nodes, active);
  return {
    start: (prepared: PreparedAgentRun, create: () => AgentRun): AgentRun => {
      const identity = canonical(prepared);
      const known = active.get(prepared.run);
      if (known) {
        if (known.identity !== identity)
          throw new Error('Request ID reused with different contents');
        return known.handle;
      }
      const handle = create();
      let settled = false;
      const owner = {
        identity,
        handle,
        dispose: () => {
          handle.stop();
          if (settled) release();
        },
      };
      const isActive = () =>
        ['accepting', 'running', 'saving', 'paused', 'unsaved'].includes(
          owner.handle.snapshot().phase,
        );
      if (!isActive()) return owner.handle;
      active.set(prepared.run, owner);
      owned.set(prepared.run, owner);
      let unsubscribe = () => {
        /* Subscription has not been installed yet. */
      };
      const release = () => {
        if (active.get(prepared.run) === owner) active.delete(prepared.run);
        owned.delete(prepared.run);
        unsubscribe();
      };
      unsubscribe = owner.handle.subscribe(() => {
        if (!isActive()) release();
      });
      owner.handle.done
        .then(() => {
          settled = true;
          if (!(owned.has(prepared.run) && isActive())) release();
        }, release)
        .catch(release);
      return owner.handle;
    },
    dispose: () => {
      for (const [run, owner] of owned) {
        owned.delete(run);
        owner.dispose();
      }
    },
  };
}
