// A small schema for test vaults, so the tests need no vault (the real one is the vault's meta/schema.yaml).
import { SCHEMA_PATH } from './note.ts';

export const SCHEMA_YAML = `
owner: Owner
types:
  moc: { label: Hubs, use: a hub }
  topic: { label: Topics, use: a topic }
  person: { label: People, use: a person }
areas:
  craft: { label: Craft, use: ideas }
  life: { label: Life, hub: Home, use: the rest }
statuses:
  active: { label: Active }
  done: { label: Done }
circles:
  friends: { label: Friends }
  family: { label: Family }
broad:
  craft: [programming]
predicates:
  part-of: { label: Part of, inverse: Parts, use: a part }
  lives-in: { label: Lives in, inverse: Residents, use: a home }
  friend-of: { label: Friend of, symmetric: true, use: friends }
  related-to: { label: Related to, symmetric: true, use: anything }
components: [Chart, Timeline, NoteList]
sources:
  vault-app: { label: The app }
  claude-code: { label: Claude Code }
procedures:
  capture: { label: Capture }
  sign-off: { label: Sign-off }
`;

/** Spread into a test vault's files. */
export const SCHEMA = { [SCHEMA_PATH]: SCHEMA_YAML };
