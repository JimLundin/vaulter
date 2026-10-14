import type { NodeReading } from '../vault/nodes/store.ts';
import { canonical } from '../vault/nodes/json.ts';
import type { AgentRun } from './runtime.ts';
import type { PreparedAgentRun } from './store.ts';

interface Owner {
  readonly identity: string;
  readonly handle: AgentRun;
  readonly dispose: () => void;
}

// Local controller evidence only. Different sessions/tabs/devices have no implied lease.
const stores = new WeakMap<object, Map<string, Owner>>();
const ownerKey = (nodes: NodeReading): object =>
  'identity' in nodes && typeof nodes.identity === 'object' && nodes.identity !== null
    ? nodes.identity
    : nodes;

export function hasLiveAgentOwner(nodes: NodeReading, run: string): boolean {
  return stores.get(ownerKey(nodes))?.has(run) ?? false;
}

/** Reconcile synchronous starts by run; never queue unrelated execution. */
export function agentOwnership(nodes: NodeReading) {
  const owned = new Map<string, Owner>();
  const active = stores.get(ownerKey(nodes)) ?? new Map<string, Owner>();
  stores.set(ownerKey(nodes), active);
  return {
    start: (prepared: PreparedAgentRun, create: () => AgentRun): AgentRun => {
      const identity = canonical({ run: prepared.run, commit: prepared.commit });
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
      const isActive = () => {
        const state = owner.handle.snapshot();
        return (
          ['accepting', 'running', 'saving', 'paused', 'unsaved'].includes(state.phase) ||
          !!(state.contentPersistence || state.contextError) ||
          Object.values(state.recoveryActivity ?? {}).some(Boolean)
        );
      };
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
