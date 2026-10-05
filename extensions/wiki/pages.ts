// The wiki's pages as records: one collection per kind, facts kept on the page with the notes they
// came from. Everything here is what the wiki offers besides revising. What a page holds is shaped by
// its kind's Zod on every write: what comes in may come from the model.
import { z } from 'zod';
import { type Collection, collection, type Rec, type RecordRef } from '#extensions/storage';
import { fields, Kind, type Page, type Wiki } from './api.ts';

export const KINDS = Kind.options;

type Fields = Record<string, unknown>;
const shapes: Record<Kind, z.ZodType<Fields>> = {
  person: z.object(fields.person),
  place: z.object(fields.place),
  event: z.object(fields.event),
  topic: z.object(fields.topic),
};
const kept = Object.fromEntries(KINDS.map((k) => [k, collection<Fields>(`wiki/${k}`)])) as Record<
  Kind,
  Collection<Fields>
>;

export function pages() {
  const kindOf = (type: string) => KINDS.find((k) => kept[k].name === type);
  const of = (ref: RecordRef) => {
    const k = kindOf(ref.type);
    if (!k) throw new Error(`${ref.type} is not a wiki type`);
    return k;
  };
  const page = (rec: Rec<Fields>): Page => {
    const { meta, ...held } = rec;
    return {
      ...held,
      type: meta.collection,
      kind: of({ type: meta.collection, id: rec.id }),
      created: meta.created,
      updated: meta.updated,
    } as Page;
  };
  const all = async () => (await Promise.all(KINDS.map((k) => kept[k].query()))).flat().map(page);

  const get = async (ref: RecordRef) => {
    const rec = await kept[of(ref)].get(ref.id);
    return rec && page(rec);
  };
  const must = async (ref: RecordRef) => {
    const e = await get(ref);
    if (!e) throw new Error(`no page ${ref.type}:${ref.id}`);
    return e;
  };
  /** The page changed by `change`, which gets it as it is now: a change made meanwhile isn't lost.
   * What isn't one of the kind's fields (id, kind, dates) is left out by its Zod. */
  const change = async (ref: RecordRef, f: (e: Page) => Partial<Page>) => {
    const k = of(ref);
    const rec = await kept[k].update(ref.id, (cur) => {
      const e = page(cur);
      return shapes[k].parse({ ...e, ...f(e) });
    });
    return page(rec);
  };
  const refOf = (e: Page): RecordRef => ({ type: e.type, id: e.id });

  const api: Omit<Wiki, 'revise'> = {
    async find(text, kinds = [...KINDS]) {
      const found = await Promise.all(
        kinds.map((k) => kept[k].search(text, { fields: ['name', 'aliases', 'summary'] })),
      );
      return found
        .flat()
        .sort((a, b) => b.meta.created.localeCompare(a.meta.created))
        .map(page);
    },
    get,
    // The kind's Zod fills in what the page doesn't give: no aliases, summary, facts or links.
    create: async (kind, input) => page(await kept[kind].create(shapes[kind].parse(input))),
    update(ref, patch) {
      const { facts: _, ...rest } = patch;
      return change(ref, () => rest as Partial<Page>);
    },
    addFact(ref, fact) {
      const added = { id: crypto.randomUUID(), added: new Date().toISOString(), ...fact };
      return change(ref, (e) => ({ facts: [...e.facts, added] }));
    },
    retractFact: (ref, factId) =>
      change(ref, (e) => ({ facts: e.facts.filter((f) => f.id !== factId) })),
    async merge(keepRef, mergeRef) {
      if (keepRef.type !== mergeRef.type)
        throw new Error('only pages of the same kind can be merged');
      const merge = await must(mergeRef);
      const same = (a: RecordRef, b: RecordRef) => a.type === b.type && a.id === b.id;
      const merged = await change(keepRef, (keep) => {
        const ids = new Set(keep.facts.map((f) => f.id));
        return {
          ...merge,
          ...keep,
          aliases: [...new Set([...keep.aliases, merge.name, ...merge.aliases])].filter(
            (a) => a !== keep.name,
          ),
          facts: [...keep.facts, ...merge.facts.filter((f) => !ids.has(f.id))],
          related: [...keep.related, ...merge.related].filter(
            (r, i, list) => !same(r, keepRef) && list.findIndex((x) => same(x, r)) === i,
          ),
        };
      });
      await kept[of(mergeRef)].delete(mergeRef.id);
      // What pointed at the merged page now points at the one kept.
      const swap = (r: unknown) => (r && same(r as RecordRef, mergeRef) ? keepRef : r);
      const swapped = (e: Page): Partial<Page> => ({
        related: e.related.map((r) => swap(r) as RecordRef),
        ...(e.kind === 'event'
          ? {
              place: swap(e.place),
              people: (e.people as RecordRef[]).map((r) => swap(r) as RecordRef),
            }
          : {}),
      });
      for (const e of await all()) {
        if (e.id === keepRef.id) continue;
        if (JSON.stringify({ ...e, ...swapped(e) }) !== JSON.stringify(e))
          await change(refOf(e), swapped);
      }
      return merged;
    },
    citing: async (noteId) =>
      (await all()).filter((e) => e.facts.some((f) => f.sources.includes(noteId))),
  };
  return { api, all };
}
