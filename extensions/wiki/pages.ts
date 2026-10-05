// The wiki's pages as records: one record type per kind, facts kept on the page with the notes they
// came from. Everything here is what wiki@1 offers besides revising.
import type { RecordRef, RecordsV1, RecordType, Stored } from '#contracts/records';
import { fields, Kind, type Page, type WikiV1 } from '#contracts/wiki';

export const KINDS = Kind.options;

export type Types = { [K in Kind]: RecordType<(typeof fields)[K]> };

export async function registerTypes(records: RecordsV1): Promise<Types> {
  return {
    person: await records.registerType('person', fields.person),
    place: await records.registerType('place', fields.place),
    event: await records.registerType('event', fields.event),
    topic: await records.registerType('topic', fields.topic),
  };
}

export function pages(records: RecordsV1, types: Types) {
  const kindOf = (type: string) => KINDS.find((k) => types[k].name === type);
  const typeOf = (ref: RecordRef) => {
    const k = kindOf(ref.type);
    if (!k) throw new Error(`${ref.type} is not a wiki type`);
    return types[k];
  };
  const page = (rec: Stored): Page => {
    const { meta, ...fields } = rec;
    const kind = kindOf(meta.type);
    if (!kind) throw new Error(`${meta.type} is not a wiki type`);
    return {
      ...fields,
      type: meta.type,
      kind,
      created: meta.created,
      updated: meta.updated,
    } as Page;
  };
  const all = async () =>
    (await Promise.all(KINDS.map((k) => records.query(types[k])))).flat().map(page);

  const get = async (ref: RecordRef) => {
    const rec = await records.get(typeOf(ref), ref.id);
    return rec && page(rec);
  };
  const must = async (ref: RecordRef) => {
    const e = await get(ref);
    if (!e) throw new Error(`no page ${ref.type}:${ref.id}`);
    return e;
  };
  /** The page changed by `change`, which gets it as it is now: a change made meanwhile isn't lost.
   * What isn't one of the kind's fields (id, kind, dates) is left out by the type's Zod. */
  const change = async (ref: RecordRef, f: (e: Page) => Partial<Page>) => {
    const rec = await records.update(typeOf(ref), ref.id, (cur) => {
      const e = page(cur);
      return { ...e, ...f(e) } as never;
    });
    return page(rec);
  };
  const refOf = (e: Page): RecordRef => ({ type: e.type, id: e.id });

  const api: Omit<WikiV1, 'revise'> = {
    async find(text, kinds = [...KINDS]) {
      const found = await records.search(kinds.map((k) => types[k]) as RecordType[], text, {
        fields: ['name', 'aliases', 'summary'],
      });
      return found.map(page);
    },
    get,
    // The kind's own Zod fills in what the page doesn't give: no aliases, summary, facts or links.
    create: async (kind, input) => page(await records.create(types[kind], input as never)),
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
      await records.merge(typeOf(keepRef), keepRef.id, mergeRef.id);
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
