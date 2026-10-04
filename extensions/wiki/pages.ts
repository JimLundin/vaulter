// The wiki's pages as records: one record type per kind, facts kept on the page with the notes they
// came from. Everything here is what wiki@1 offers besides revising.
import type { RecordRef, RecordsV1, RecordType } from '@contracts/records';
import {
  type Entity,
  fields,
  type Kind,
  NewEntity,
  type WikiTypes,
  type WikiV1,
} from '@contracts/wiki';

export const KINDS = ['person', 'place', 'event', 'topic'] as const;

export type Types = { [K in Kind]: RecordType<(typeof fields)[K]> };

export function registerTypes(records: RecordsV1): Types {
  return {
    person: records.registerType('person', fields.person),
    place: records.registerType('place', fields.place),
    event: records.registerType('event', fields.event),
    topic: records.registerType('topic', fields.topic),
  };
}

const words = (s: string) =>
  s
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

export function pages(records: RecordsV1, types: Types) {
  const kindOf = (type: string) => KINDS.find((k) => types[k].name === type);
  const typeOf = (ref: RecordRef) => {
    const k = kindOf(ref.type);
    if (!k) throw new Error(`${ref.type} is not a wiki type`);
    return types[k];
  };
  const entity = (rec: object | undefined): Entity | undefined =>
    rec ? ({ ...rec, kind: kindOf(String((rec as { type: string }).type))! } as Entity) : undefined;
  const all = async (kinds: readonly Kind[] = KINDS) =>
    (await Promise.all(kinds.map((k) => records.query(types[k])))).flat().map((r) => entity(r)!);

  const get = async (ref: RecordRef) => entity(await records.get(typeOf(ref), ref.id));
  const must = async (ref: RecordRef) => {
    const e = await get(ref);
    if (!e) throw new Error(`no page ${ref.type}:${ref.id}`);
    return e;
  };
  const save = async (e: Entity) => {
    const {
      kind: _k,
      type,
      created: _c,
      updated: _u,
      v: _v,
      ...rest
    } = e as Entity & { v?: number };
    return entity(await records.put(typeOf({ type, id: e.id }), rest as never))!;
  };
  const refOf = (e: Entity): RecordRef => ({ type: e.type, id: e.id });

  const api: Omit<WikiV1, 'revise' | 'onChanged'> = {
    types: () => Promise.resolve(types as unknown as WikiTypes),
    async find(text, kinds) {
      const want = words(text);
      return (await all(kinds)).filter((e) => {
        const hay = words([e.name, ...e.aliases, e.summary].join(' ')).join(' ');
        return want.every((w) => hay.includes(w));
      });
    },
    get,
    async create(kind, input) {
      const e = NewEntity.parse(input);
      const rec = await records.put(types[kind], {
        aliases: [],
        summary: '',
        facts: [],
        related: [],
        ...e,
      } as never);
      return entity(rec)!;
    },
    async update(ref, patch) {
      const { facts: _f, id: _i, type: _t, kind: _k, ...rest } = patch;
      return save({ ...(await must(ref)), ...rest });
    },
    async addFact(ref, fact) {
      const e = await must(ref);
      const added = { id: crypto.randomUUID(), added: new Date().toISOString(), ...fact };
      return save({ ...e, facts: [...e.facts, added] });
    },
    async retractFact(ref, factId) {
      const e = await must(ref);
      return save({ ...e, facts: e.facts.filter((f) => f.id !== factId) });
    },
    async merge(keepRef, mergeRef) {
      if (keepRef.type !== mergeRef.type)
        throw new Error('only pages of the same kind can be merged');
      const [keep, merge] = await Promise.all([must(keepRef), must(mergeRef)]);
      const ids = new Set(keep.facts.map((f) => f.id));
      const same = (a: RecordRef, b: RecordRef) => a.type === b.type && a.id === b.id;
      const related = [...keep.related, ...merge.related].filter(
        (r, i, list) => !same(r, keepRef) && list.findIndex((x) => same(x, r)) === i,
      );
      const merged = await save({
        ...merge,
        ...keep,
        aliases: [...new Set([...keep.aliases, merge.name, ...merge.aliases])].filter(
          (a) => a !== keep.name,
        ),
        facts: [...keep.facts, ...merge.facts.filter((f) => !ids.has(f.id))],
        related,
      });
      await records.merge(typeOf(keepRef), keep.id, merge.id);
      // What pointed at the merged page now points at the one kept.
      const swap = (r: unknown) => (r && same(r as RecordRef, mergeRef) ? keepRef : r);
      for (const e of await all()) {
        if (e.id === keep.id) continue;
        const next: Entity = {
          ...e,
          related: e.related.map((r) => swap(r) as RecordRef),
          ...(e.kind === 'event'
            ? {
                place: swap(e.place),
                people: (e.people as RecordRef[]).map((r) => swap(r) as RecordRef),
              }
            : {}),
        };
        // biome-ignore lint/performance/noAwaitInLoops: a sweep, rare
        if (JSON.stringify(next) !== JSON.stringify(e)) await save(next);
      }
      return merged;
    },
    citing: async (noteId) =>
      (await all()).filter((e) => e.facts.some((f) => f.sources.includes(noteId))),
  };
  return { api, all, refOf, kindOf };
}
