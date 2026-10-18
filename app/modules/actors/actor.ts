import { e, type ReadView, type Transaction } from '@/core/store/index.ts';

/** Attribution shared by producers; provider credentials never belong to an actor. */
export const Actor = e.entity('actor', {
  name: e.string(),
  kind: e.enum('user', 'agent', 'system'),
});

/** Integration binding for a caller's configured account key, separate from a display name. */
export const ActorBinding = e.entity('actor.binding', {
  key: e.string(),
  actor: e.ref(Actor),
});

// biome-ignore lint/style/useConsistentTypeDefinitions: Schema aliases satisfy the EAV registry constraint.
type ActorSchema = { actors: typeof Actor; actorBindings: typeof ActorBinding };

/** Resolve a configured account without assigning authority from its display name. */
export async function readActorBinding(
  view: ReadView<ActorSchema>,
  key: string,
  kind: 'user' | 'agent' | 'system',
) {
  if (!key) throw new Error('Configure a nonempty Actor account key.');
  const binding = await view.entities.actorBindings.first({
    where: { key: { eq: key } },
    select: { actor: { name: true, kind: true } },
  });
  if (binding && binding.actor.kind !== kind)
    throw new Error(`Configured ${kind} account has an incompatible actor kind.`);
  return binding?.actor;
}

/** Lookup and creation belong to the caller's atomic publication; this never retries it. */
export async function bindActor(
  tx: Transaction<ActorSchema>,
  key: string,
  kind: 'user' | 'agent' | 'system',
  name: string,
) {
  const existing = await readActorBinding(tx, key, kind);
  if (existing) return existing;
  const actor = await tx.entities.actors.insert({ name, kind });
  await tx.entities.actorBindings.insert({ key, actor });
  return actor;
}
