// The wiki's pages as records: one record type per kind, facts kept on the page with the notes they
// came from. Everything here is what wiki@1 offers besides revising.
import type { RecordRef, RecordsV1, RecordType, Stored } from '#contracts/records';
import { type Entity, fields, Kind, type WikiV1 } from '#contracts/wiki';

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
  const entity = (rec: Stored): Entity => {
    const { meta, ...fields } = rec;
    const kind = kindOf(meta.type);
    if (!kind) throw new Error(`${meta.type} is not a wiki type`);
    return {
      ...fields,
      type: meta.type,
      kind,
      created: meta.created,
      updated: meta.updated,
    } as Entity;
  };
  const all = async (kinds: readonly Kind[] = KINDS) =>
    (await Promise.all(kinds.map((k) => records.query(types[k])))).flat().map(entity);

  const get = async (ref: RecordRef) => {
    const rec = await records.get(typeOf(ref), ref.id);
    return rec && entity(rec);
  };
  const must = async (ref: RecordRef) => {
    const e = await get(ref);
    if (!e) throw new Error(`no page ${ref.type}:${ref.id}`);
    return e;
  };
  /** The page changed by `change`, which gets it as it is now: a change made meanwhile isn't lost.
   * What isn't one of the kind's fields (id, kind, dates) is left out by the type's Zod. */
  const change = async (ref: RecordRef, f: (e: Entity) => Partial<Entity>) => {
    const rec = await records.update(typeOf(ref), ref.id, (cur) => {
      const e = entity(cur);
      return { ...e, ...f(e) } as never;
    });
    return entity(rec);
  };
  const refOf = (e: Entity): RecordRef => ({ type: e.type, id: e.id });

  const api: Omit<WikiV1, 'revise'> = {
    async find(text, kinds = [...KINDS]) {
      const found = await records.search(kinds.map((k) => types[k]) as RecordType[], text, {
        fields: ['name', 'aliases', 'summary'],
      });
      return found.map(entity);
    },
    get,
    // The kind's own Zod fills in what the page doesn't give: no aliases, summary, facts or links.
    create: async (kind, input) => entity(await records.create(types[kind], input as never)),
    update(ref, patch) {
      const { facts: _f, id: _i, type: _t, kind: _k, ...rest } = patch;
      return change(ref, () => rest as Partial<Entity>);
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
      const swapped = (e: Entity): Partial<Entity> => ({
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
