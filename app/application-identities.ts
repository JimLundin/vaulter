// Caller-owned identities. These defaults are configuration for this personal Vault, not authentication.
import type { NodeStore, NodeCommit } from './vault/nodes/store.ts';
import { nodeOperations } from './vault/nodes/operations.ts';
import { frozen, digest } from './vault/nodes/json.ts';

export interface ApplicationIdentities {
  readonly user: string;
  readonly agent: string;
}
export const defaultIdentities: ApplicationIdentities = {
  user: 'vaulter:owner',
  agent: 'vaulter:agent',
};
export function createApplicationIdentities(
  nodes: NodeStore,
  identities: ApplicationIdentities = defaultIdentities,
) {
  let pending: NodeCommit | undefined;
  let ensuring: Promise<void> | undefined;
  const missing = async () => {
    const snapshot = await nodes.snapshot();
    return (
      [
        ['user', 'actor', 'Vault owner'],
        ['agent', 'agent', 'Vault agent'],
      ] as const
    ).flatMap(([role, kind, name]) => {
      const id = identities[role];
      const existing = snapshot.get(id);
      if (existing && existing.data?.kind !== kind)
        throw new Error(
          `The configured ${role} identity is deleted or has an incompatible kind: ${id}`,
        );
      return existing
        ? []
        : [{ node: id, expected: null, placement: null, connection: null, data: { kind, name } }];
    });
  };
  const ensure = () => {
    ensuring ??= (async () => {
      if (!(identities.user && identities.agent) || identities.user === identities.agent)
        throw new Error('Configure distinct nonempty owner and Agent node identities.');
      const changes = await missing();
      if (!changes.length) {
        pending = undefined;
        return;
      }
      pending ??= frozen({
        id: `vaulter:identities:${await digest({ identities, changes })}`,
        recordedBy: identities.user,
        origin: null,
        undoOf: null,
        kind: nodeOperations.create,
        message: 'Establish application identities',
        changes,
      });
      try {
        await nodes.commit(pending);
        pending = undefined;
      } catch (error) {
        // Another caller, or an accepted request with a lost response, can establish the same pair.
        if (!(await missing()).length) {
          pending = undefined;
          return;
        }
        throw error;
      }
    })().finally(() => {
      ensuring = undefined;
    });
    return ensuring;
  };
  return { identities, ensure };
}
