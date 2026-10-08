// A slot: a place in a feature's own screens that other features fill (a note's sections, its footer's
// links), typed by what an entry is. Its owner makes it, exports it and reads it; a feature that fills it
// imports it from the owner, so dependencies point at what a feature adds to, and deleting a feature only
// breaks what imported it.
import type { Extension } from './extension.ts';

/** An entry in a slot, as an extension lists it in `contributes`. Only its slot can read it back. */
export interface Contribution {
  readonly slot: string;
}

export interface Slot<Entry> {
  readonly id: string;
  /** An entry for this slot, to list in an extension's `contributes`. */
  add: (entry: Entry) => Contribution;
  /** Every entry in this slot from `extensions`, in their order, with the extension each came from. */
  of: (extensions: readonly Extension[]) => { from: string; entry: Entry }[];
}

/** A slot named `id` (`notes.sections`), whose entries are `Entry`s. */
export function slot<Entry>(id: string): Slot<Entry> {
  // Each entry is kept by the token `add` gave out, so reading it back keeps its type
  const entries = new WeakMap<Contribution, Entry>();
  return {
    id,
    add(entry) {
      const contribution = { slot: id };
      entries.set(contribution, entry);
      return contribution;
    },
    of: (extensions) =>
      extensions.flatMap((e) =>
        (e.contributes ?? []).flatMap((c) => {
          const entry = entries.get(c);
          return entry === undefined ? [] : [{ from: e.id, entry }];
        }),
      ),
  };
}
