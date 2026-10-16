import { e } from '../eav/index.ts';

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
