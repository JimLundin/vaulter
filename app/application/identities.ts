// Caller-owned identities. These defaults are configuration for this personal Vault, not authentication.
import type { TransactionStore, TransactionRequest } from '@/vault/transactions/store.ts';
import type { NodeSnapshot } from '@/vault/nodes/store.ts';
import { nodeOperations } from '@/vault/nodes/operations.ts';

export interface ApplicationIdentities {
  readonly user: string;
  readonly agent: string;
}
export const defaultIdentities: ApplicationIdentities = {
  user: 'vaulter:owner',
  agent: 'vaulter:agent',
};
export function createApplicationIdentities(
  nodes: TransactionStore,
  identities: ApplicationIdentities = defaultIdentities,
) {
  let pending: TransactionRequest<void> | undefined;
  let ensuring: Promise<void> | undefined;
  const missing = (snapshot: NodeSnapshot) =>
    (
      [
        ['user', 'actor', 'Vault owner'],
        ['agent', 'agent', 'Vault agent'],
      ] as const
    ).filter(([role, kind]) => {
      const id = identities[role];
      const existing = snapshot.get(id);
      if (existing && existing.data?.kind !== kind)
        throw new Error(
          `The configured ${role} identity is deleted or has an incompatible kind: ${id}`,
        );
      return !existing;
    });
  const ensure = () => {
    ensuring ??= (async () => {
      if (!(identities.user && identities.agent) || identities.user === identities.agent)
        throw new Error('Configure distinct nonempty owner and Agent node identities.');
      if (!missing(await nodes.snapshot()).length) {
        pending = undefined;
        return;
      }
      using writes = nodes.writer({ recordedBy: identities.user, origin: null }).lifetime();
      try {
        if (pending) await writes.retry(pending);
        else {
          pending = writes.write(async ({ nodes: reading }) => {
            const snapshot = await reading.snapshot();
            const changes = missing(snapshot).map(([role, kind, name]) => ({
              node: identities[role],
              expected: null,
              placement: null,
              connection: null,
              data: { kind, name },
            }));
            return {
              value: undefined,
              transaction: {
                undoOf: null,
                kind: nodeOperations.create,
                message: 'Establish application identities',
                changes,
              },
            };
          });
          await pending.result;
        }
        pending = undefined;
      } catch (error) {
        // Another caller, or an accepted request with a lost response, can establish the same pair.
        if (!missing(await nodes.snapshot()).length) {
          pending = undefined;
          return;
        }
        if (pending?.snapshot().phase === 'rejected') pending = undefined;
        throw error;
      }
    })().finally(() => {
      ensuring = undefined;
    });
    return ensuring;
  };
  return { identities, ensure };
}
