// records@1 over the kernel's storage for this extension (one namespace, IndexedDB underneath). Keys:
//   t:<type>               the type: its schema, version and owner
//   r:<type>:<id>          a record
//   a:<type>:<id>          a merged record's id, pointing at the one it was merged into
//   h:<type>:<v>:<id>      a record as it was at version v, before a migration
// Queries read a type's records and filter in memory: plenty for one person's data.
import type { ExtStorage } from '@pip/kernel';
import type { Change, JsonSchema, RecordsWire, Stored, Where } from '@contracts/records';
import { z } from 'zod';

interface TypeEntry {
  schema: JsonSchema;
  version: number;
}

export function localRecords(storage: ExtStorage) {
  const listeners = new Map<string, Set<(c: Change) => void>>();
  const schemas = new Map<string, z.ZodType>();
  // Each record created after the one before, even within a millisecond, so "newest first" holds.
  let last = 0;
  const stamp = () => {
    last = Math.max(Date.now(), last + 1);
    return new Date(last).toISOString();
  };
  const emit = (type: string, c: Change) => {
    for (const l of listeners.get(type) ?? []) void Promise.resolve(l(c)).catch(() => undefined);
  };
  const typeOf = async (type: string) => {
    const t = await storage.get<TypeEntry>(`t:${type}`);
    if (!t) throw new Error(`no record type "${type}"`);
    return t;
  };
  const validator = (type: string, t: TypeEntry) => {
    const k = `${type}@${t.version}`;
    if (!schemas.has(k)) schemas.set(k, z.fromJSONSchema(t.schema as never));
    return schemas.get(k)!;
  };
  const all = async (type: string) => (await storage.list<Stored>(`r:${type}:`)).map(([, r]) => r);
  const resolveId = async (type: string, id: string) =>
    (await storage.get<string>(`a:${type}:${id}`)) ?? id;

  const make = (caller: string): RecordsWire => {
    const mine = (type: string) => {
      if (!type.startsWith(`${caller}/`)) throw new Error(`${caller} may not write ${type}`);
    };
    const save = async (type: string, rec: Stored) => {
      await storage.set(`r:${type}:${rec.id}`, rec);
      emit(type, rec);
      return rec;
    };

    return {
      async register(name, schema, version, migrations) {
        const type = `${caller}/${name}`;
        const prior = await storage.get<TypeEntry>(`t:${type}`);
        await storage.set(`t:${type}`, { schema, version } satisfies TypeEntry);
        if (!prior || prior.version === version) return;
        if (prior.version > version) return this.revert(type, version);
        // Migrate every record up, one version at a time, keeping each as it was.
        const check = validator(type, { schema, version });
        for (const rec of await all(type)) {
          let { id, type: _t, created, updated, v, ...data } = rec;
          for (; v < version; v++) {
            const up = migrations[String(v)];
            if (!up) throw new Error(`${type}: no migration from version ${v}`);
            // biome-ignore lint/performance/noAwaitInLoops: each step needs the one before
            await storage.set(`h:${type}:${v}:${id}`, { ...data, id, type, created, updated, v });
            data = await up(data);
          }
          await storage.set(`r:${type}:${id}`, {
            ...(check.parse(data) as Record<string, unknown>),
            id,
            type,
            created,
            updated,
            v: version,
          });
        }
      },

      async get(type, id) {
        return storage.get<Stored>(`r:${type}:${await resolveId(type, id)}`);
      },

      async query(type, where: Where = {}) {
        let out = await all(type);
        if (where.since) out = out.filter((r) => r.created >= where.since!);
        if (where.until) out = out.filter((r) => r.created < where.until!);
        out.sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
        if (where.order !== 'oldest') out.reverse();
        return out.slice(0, where.limit);
      },

      async search(types, text) {
        const words = text.toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const found = (await Promise.all(types.map(all))).flat();
        return found.filter((r) => {
          const hay = Object.values(r)
            .filter((v) => typeof v === 'string')
            .join(' ')
            .toLocaleLowerCase();
          return words.every((w) => hay.includes(w));
        });
      },

      async put(type, value) {
        mine(type);
        const t = await typeOf(type);
        const { id, ...fields } = value as { id?: string } & Record<string, unknown>;
        const data = validator(type, t).parse(fields) as Record<string, unknown>;
        const prior = id ? await this.get(type, id) : undefined;
        const now = stamp();
        return save(type, {
          ...data,
          id: prior?.id ?? id ?? crypto.randomUUID(),
          type,
          created: prior?.created ?? now,
          updated: now,
          v: t.version,
        });
      },

      async delete(type, id) {
        mine(type);
        await storage.delete(`r:${type}:${id}`);
        emit(type, { id, type, deleted: true });
      },

      async merge(type, keepId, mergeId) {
        mine(type);
        const [keep, merge] = await Promise.all([this.get(type, keepId), this.get(type, mergeId)]);
        if (!(keep && merge)) throw new Error(`${type}: both records must exist to merge`);
        const merged = { ...merge, ...keep, updated: stamp() } as Stored;
        await storage.delete(`r:${type}:${merge.id}`);
        await storage.set(`a:${type}:${merge.id}`, keep.id);
        emit(type, { id: merge.id, type, deleted: true });
        return save(type, merged);
      },

      onChanged(type, handler) {
        const set = listeners.get(type) ?? new Set();
        listeners.set(type, set);
        set.add(handler);
        return Promise.resolve(() => {
          set.delete(handler);
        });
      },

      async revert(type, version) {
        mine(type);
        const t = await typeOf(type);
        for (const rec of await all(type)) {
          if (rec.v <= version) continue;
          // biome-ignore lint/performance/noAwaitInLoops: one record at a time
          const old = await storage.get<Stored>(`h:${type}:${version}:${rec.id}`);
          if (old) await storage.set(`r:${type}:${rec.id}`, old);
        }
        await storage.set(`t:${type}`, { ...t, version });
      },
    };
  };

  /** Drops every type the caller registered, and their records. */
  const forget = async (caller: string) => {
    // biome-ignore lint/performance/noAwaitInLoops: a sweep, once
    for (const prefix of ['t:', 'r:', 'a:', 'h:'])
      for (const [key] of await storage.list(`${prefix}${caller}/`)) await storage.delete(key);
  };

  return { make, forget };
}
