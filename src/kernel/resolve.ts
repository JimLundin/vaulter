// The referee: wires every `requires` among extensions whose static fields were read (readStatics) to
// one `provides`.
// An extension that can't be wired is left out with its reasons, and so is everything that needed it;
// the rest still loads (the delete test: removing a feature must not stop the app).
import type { Statics } from './extension.ts';

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
  id: string;
  statics: Statics;
}

type Wiring = Record<string, string>;

/** Contract key → the ids of the extensions providing it. */
function providersOf(statics: Map<string, Statics>) {
  const providers = new Map<string, string[]>();
  for (const [id, s] of statics)
    for (const c of Object.values(s.provides))
      providers.set(c.key, [...(providers.get(c.key) ?? []), id]);
  return providers;
}

/** `id`'s wiring among `providers`, or what stops it: each `requires` needs exactly one other
 * provider; an `optional` one is wired when there is, and left out otherwise. */
function wire(id: string, statics: Statics, providers: Map<string, string[]>) {
  const wired: Wiring = {};
  const problems: string[] = [];
  for (const [as, c] of Object.entries(statics.requires)) {
    const ids = providers.get(c.key) ?? [];
    if (ids.length === 0) problems.push(`requires ${c.key}, which nothing installed provides`);
    else if (ids.length > 1)
      problems.push(`requires ${c.key}, which ${ids.join(' and ')} both provide`);
    else if (ids[0] === id) problems.push(`requires ${c.key}, which only it provides`);
    else wired[as] = ids[0];
  }
  for (const [as, c] of Object.entries(statics.optional)) {
    const ids = providers.get(c.key) ?? [];
    if (ids.length === 1 && ids[0] !== id) wired[as] = ids[0];
  }
  return { wired, problems };
}

/** `started` are extensions already running (a source provider started first), which provide but are
 * not resolved again. Two extensions providing the same contract is a problem for whatever requires
 * it: there is nothing to choose between them yet. */
export function resolve(
  candidates: Candidate[],
  started: { id: string; statics: Statics }[] = [],
): Resolution {
  const refused = new Map<string, string[]>();
  const refuse = (id: string, problem: string) =>
    refused.set(id, [...(refused.get(id) ?? []), problem]);

  const running = new Map(started.map((x) => [x.id, x.statics]));
  const valid = new Map<string, Statics>();
  for (const { id, statics } of candidates) {
    if (valid.has(id) || running.has(id)) refuse(id, `two extensions have the id "${id}"`);
    else valid.set(id, statics);
  }

  // Leave out, until nothing changes, whatever can't be wired to the extensions still in.
  const wiring = new Map<string, Wiring>();
  for (let changed = true; changed; ) {
    changed = false;
    const providers = providersOf(new Map([...running, ...valid]));
    for (const [id, statics] of [...valid]) {
      const { wired, problems } = wire(id, statics, providers);
      if (!problems.length) {
        wiring.set(id, wired);
        continue;
      }
      for (const p of problems) refuse(id, p);
      valid.delete(id);
      changed = true;
    }
  }

  const accepted = order(valid, wiring, running, refuse);
  return { accepted, refused: [...refused].map(([id, problems]) => ({ id, problems })) };
}

/** The extensions in `valid`, each after what it requires; a cycle can't start, so each of its
 * members is refused, and so is what required something that couldn't start. */
function order(
  valid: Map<string, Statics>,
  wiring: Map<string, Wiring>,
  running: Map<string, Statics>,
  refuse: (id: string, problem: string) => void,
) {
  const accepted: Accepted[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const inCycle = (id: string, path: string[]) => {
    const cycle = [...path.slice(path.indexOf(id)), id];
    for (const m of cycle.slice(0, -1)) {
      refuse(m, `a cycle: ${cycle.join(' → ')}`);
      valid.delete(m);
    }
    return false;
  };

  /** Whether each of `id`'s providers can start; an optional one that can't, or that would close a
   * cycle, is left out of its wiring. */
  const depsStart = (id: string, wired: Wiring, optional: Statics['optional'], path: string[]) => {
    let ok = true;
    for (const [as, dep] of Object.entries(wired)) {
      if (!(as in optional)) ok = visit(dep, [...path, id]) && ok;
      else if (state.get(dep) === 'visiting' || !visit(dep, [...path, id])) delete wired[as];
    }
    return ok;
  };

  const visit = (id: string, path: string[]): boolean => {
    if (running.has(id)) return true;
    if (state.get(id) === 'done') return valid.has(id);
    if (state.get(id) === 'visiting') return inCycle(id, path);
    const statics = valid.get(id);
    const wired = wiring.get(id);
    if (!(statics && wired)) return false;
    state.set(id, 'visiting');
    const ok = depsStart(id, wired, statics.optional, path);
    state.set(id, 'done');
    if (!(ok && valid.has(id))) {
      if (valid.delete(id)) refuse(id, 'something it requires could not start');
      return false;
    }
    accepted.push({ id, statics, wiring: wired });
    return true;
  };

  for (const id of [...valid.keys()]) visit(id, []);
  return accepted;
}
