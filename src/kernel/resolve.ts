// The referee: validates each extension's static fields and wires every `requires` to one `provides`.
// An extension that can't be wired is left out with its reasons, and so is everything that needed it;
// the rest still loads (the delete test: removing a feature must not stop the app).
import { satisfies } from './contract.ts';
import { KERNEL_API } from './version.ts';
import { Statics } from './extension.ts';

export interface Accepted {
  id: string;
  statics: Statics;
  /** For each `requires` alias, and each `optional` one that could be met, the id of the extension
   * that provides it. */
  wiring: Record<string, string>;
}

export interface Refused {
  /** The extension's id, or where it came from when its definition has none. */
  id: string;
  problems: string[];
}

export interface Resolution {
  /** In an order where every extension comes after the ones it requires. */
  accepted: Accepted[];
  refused: Refused[];
}

export interface Candidate {
  /** The folder it came from (extensions/<id>): its id must be the folder's name. */
  folder: string;
  /** Its static fields as its sandbox reported them, not yet validated. */
  statics: unknown;
}

/** `choose` settles two providers of the same contract: contract key → extension id. `started` are
 * extensions already running (the bootstrap set), which provide but are not resolved again. */
export function resolve(
  candidates: Candidate[],
  choose: Record<string, string> = {},
  started: { id: string; statics: Statics }[] = [],
): Resolution {
  const refused = new Map<string, string[]>();
  const refuse = (id: string, problem: string) =>
    refused.set(id, [...(refused.get(id) ?? []), problem]);

  const valid = new Map<string, { statics: Statics }>();
  for (const { folder, statics } of candidates) {
    const parsed = Statics.safeParse(statics);
    if (!parsed.success) {
      for (const i of parsed.error.issues)
        refuse(folder, `${i.path.join('.') || 'definition'}: ${i.message}`);
      continue;
    }
    const { id } = parsed.data;
    if (!satisfies(KERNEL_API, parsed.data.kernel))
      refuse(folder, `needs kernel API ${parsed.data.kernel}; this kernel has ${KERNEL_API}`);
    else if (id !== folder) refuse(folder, `its id is "${id}"; it must be its folder's name`);
    else if (valid.has(id) || started.some((x) => x.id === id))
      refuse(id, `two extensions have the id "${id}"`);
    else valid.set(id, { statics: parsed.data });
  }

  // Leave out, until nothing changes, whatever can't be wired to the extensions still in.
  const live = new Set(valid.keys());
  const running = new Map(started.map((x) => [x.id, x.statics]));
  const staticsOf = (id: string) => valid.get(id)?.statics ?? running.get(id)!;
  const wiring = new Map<string, Record<string, string>>();
  for (let changed = true; changed; ) {
    changed = false;
    const providers = new Map<string, string[]>();
    for (const id of [...running.keys(), ...live])
      for (const c of Object.values(staticsOf(id).provides))
        providers.set(c.key, [...(providers.get(c.key) ?? []), id]);

    for (const id of [...live]) {
      const { statics } = valid.get(id)!;
      const wired: Record<string, string> = {};
      const problems: string[] = [];
      for (const [as, c] of Object.entries(statics.requires)) {
        const all = providers.get(c.key) ?? [];
        const ids = choose[c.key] && all.includes(choose[c.key]) ? [choose[c.key]] : all;
        if (ids.length === 0) problems.push(`requires ${c.key}, which nothing installed provides`);
        else if (ids.length > 1)
          problems.push(`requires ${c.key}, provided by ${ids.join(' and ')}: choose one`);
        else if (ids[0] === id) problems.push(`requires ${c.key}, which only it provides`);
        else {
          const p = Object.values(staticsOf(ids[0]).provides).find((x) => x.key === c.key)!;
          if (satisfies(p.version, c.version)) wired[as] = ids[0];
          else problems.push(`requires ${c.name} ${c.version}; ${ids[0]} provides ${p.version}`);
        }
      }
      // Optional: wired when exactly one provider fits; otherwise the extension starts without it.
      for (const [as, c] of Object.entries(statics.optional)) {
        const all = providers.get(c.key) ?? [];
        const ids = choose[c.key] && all.includes(choose[c.key]) ? [choose[c.key]] : all;
        if (ids.length !== 1 || ids[0] === id) continue;
        const p = Object.values(staticsOf(ids[0]).provides).find((x) => x.key === c.key)!;
        if (satisfies(p.version, c.version)) wired[as] = ids[0];
      }
      if (problems.length) {
        for (const p of problems) refuse(id, p);
        live.delete(id);
        changed = true;
      } else wiring.set(id, wired);
    }
  }

  // Order by dependencies; a cycle can't start, so each of its members is refused.
  const accepted: Accepted[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, path: string[]): boolean => {
    if (running.has(id)) return true;
    if (state.get(id) === 'done') return live.has(id);
    if (state.get(id) === 'visiting') {
      const cycle = [...path.slice(path.indexOf(id)), id];
      for (const m of cycle.slice(0, -1)) {
        refuse(m, `a cycle: ${cycle.join(' → ')}`);
        live.delete(m);
      }
      return false;
    }
    state.set(id, 'visiting');
    let ok = true;
    const wired = wiring.get(id)!;
    const { optional } = valid.get(id)!.statics;
    for (const [as, dep] of Object.entries(wired)) {
      if (as in optional) {
        // An optional provider that can't start, or that would close a cycle, is left out.
        if (state.get(dep) === 'visiting' || !visit(dep, [...path, id])) delete wired[as];
      } else ok = visit(dep, [...path, id]) && ok;
    }
    state.set(id, 'done');
    if (!(ok && live.has(id))) {
      if (live.delete(id)) refuse(id, 'something it requires could not start');
      return false;
    }
    accepted.push({ id, statics: valid.get(id)!.statics, wiring: wiring.get(id)! });
    return true;
  };
  for (const id of [...live]) visit(id, []);

  return { accepted, refused: [...refused].map(([id, problems]) => ({ id, problems })) };
}
