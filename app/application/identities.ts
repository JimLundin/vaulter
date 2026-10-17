import { bindActor } from '@/vault/records/actor.ts';
import { ConflictError, SaveError, type DomainDatabase } from '@/vault/eav/index.ts';
import type { Actor, ActorBinding } from '@/vault/records/actor.ts';

/** Caller account keys bind to opaque actors; display names do not confer authority. */
export interface ApplicationIdentities {
  readonly user: string;
  readonly agent: string;
}
export const defaultIdentities: ApplicationIdentities = {
  user: 'vaulter:owner',
  agent: 'vaulter:agent',
};
type IdentityDatabase = DomainDatabase<{
  actors: typeof Actor;
  actorBindings: typeof ActorBinding;
}>;

export function createApplicationIdentities(
  database: () => Promise<IdentityDatabase>,
  identities: ApplicationIdentities = defaultIdentities,
) {
  let pending: SaveError | undefined;
  let ensuring: Promise<void> | undefined;
  async function establish() {
    if (!(identities.user && identities.agent) || identities.user === identities.agent)
      throw new Error('Configure distinct nonempty owner and Agent account keys.');
    const db = await database();
    if (pending) {
      await pending.retry();
      pending = undefined;
    }
    try {
      await db.transaction(async (tx) => {
        for (const [role, kind, name] of [
          ['user', 'user', 'Vault owner'],
          ['agent', 'agent', 'Vault agent'],
        ] as const) {
          await bindActor(tx, identities[role], kind, name);
        }
      });
    } catch (error) {
      if (error instanceof SaveError) pending = error;
      if (error instanceof ConflictError) {
        const bindings = await db.entities.actorBindings.query({
          where: { key: { in: [identities.user, identities.agent] } },
          select: { key: true, actor: { kind: true } },
        });
        if (
          bindings.some((item) => item.key === identities.user && item.actor.kind === 'user') &&
          bindings.some((item) => item.key === identities.agent && item.actor.kind === 'agent')
        )
          return;
      }
      throw error;
    }
  }
  const ensure = () => {
    ensuring ??= establish().finally(() => {
      ensuring = undefined;
    });
    return ensuring;
  };
  return { identities, ensure };
}
