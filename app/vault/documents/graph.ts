// The knowledge graph: the notes as nodes and what connects them: links (backlinks), relations, topics,
// activity, and when each note last changed. Built from what notes reads out of each note (links.ts,
// refs.ts, fields.ts), never from the files' text or frontmatter. Pure; each part computed on first use
// and kept. Features derive their own data with perGraph (below), so adding one never touches this file.
import {
  kind,
  titleOf,
  hrefOf,
  topicsOf,
  writtenOf,
  isTopical,
  type Note,
} from './notes/fields.ts';
import { linksOf } from './notes/links.ts';
import { relationsOf } from './notes/refs.ts';
import { NO_SCHEMA, schemaFor, type Schema } from './notes/schema.ts';
import { notesOf } from './notes/notes.ts';
import type { VaultFile } from '../files.ts';
import { today } from './format.ts';

export interface Backlink {
  from: Note;
  context: string;
}
export interface Edge {
  label: string;
  notes: Note[];
}

export type Graph = ReturnType<typeof deriveGraph>;

/** The vault over its notes and its schema (meta/schema.yaml), which every view reads from here.
 * `t`: today, for when notes last changed (dates past it don't count). */
export function deriveGraph(notes: Note[], schema: Schema, t = today()) {
  const byId = new Map(notes.map((n) => [n.id, n]));
  /** Site href ("/janne/") -> note: what a route points at. */
  const byHref = new Map(notes.map((n) => [hrefOf(n), n]));
  const once = <T>(f: () => T) => {
    let v: { value: T } | undefined;
    return () => {
      v ??= { value: f() };
      return v.value;
    };
  };

  const backlinks = once(() => {
    const out = new Map<string, Backlink[]>();
    for (const n of notes)
      for (const { id, context } of linksOf(n)) {
        const list = out.get(id) ?? [];
        list.push({ from: n, context });
        out.set(id, list);
      }
    // Topic notes first (alphabetical), then logs newest first.
    const rank = (n: Note) => (kind(n.id) === 'note' ? 0 : 1);
    for (const list of out.values())
      list.sort(
        (a, b) =>
          rank(a.from) - rank(b.from) ||
          (rank(a.from)
            ? b.from.id.localeCompare(a.from.id)
            : titleOf(a.from).localeCompare(titleOf(b.from))),
      );
    return out;
  });

  /** lastSeen: the newest daily note linking to a note. degree: how many notes link to it. */
  const signals = once(() => {
    const lastSeen = new Map<string, string>();
    const degree = new Map<string, number>();
    for (const [id, list] of backlinks()) {
      degree.set(id, list.filter((b) => kind(b.from.id) === 'note').length);
      for (const b of list)
        if (kind(b.from.id) === 'daily') {
          const d = b.from.id.slice(6);
          if (d > (lastSeen.get(id) ?? '')) lastSeen.set(id, d);
        }
    }
    return { lastSeen, degree };
  });

  /** Topic -> the topical notes that carry it (meta/conventions.md §3, "Broad topics"). */
  const topics = once(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes.filter(isTopical))
      for (const topic of topicsOf(n)) {
        const l = map.get(topic) ?? [];
        l.push(n);
        map.set(topic, l);
      }
    return map;
  });

  /** id -> labelled groups of related notes, stated relations and their inverses merged (§3, "Relations"). */
  const graph = once(() => {
    const out = new Map<string, Map<string, Note[]>>();
    const add = (from: string, label: string, to: Note) => {
      const m = out.get(from) ?? new Map<string, Note[]>();
      const l = m.get(label) ?? [];
      if (!l.includes(to)) l.push(to);
      m.set(label, l);
      out.set(from, m);
    };
    for (const n of notes) {
      for (const { predicate, targets } of relationsOf(n)) {
        const def = schema.predicates[predicate];
        if (!def) continue;
        for (const id of targets) {
          const target = byId.get(id);
          if (!target) continue;
          add(n.id, def.label, target);
          add(target.id, def.symmetric ? def.label : def.inverse!, n);
        }
      }
    }
    const order = Object.values(schema.predicates)
      .flatMap((d) => [d.label, d.inverse])
      .filter(Boolean);
    const result = new Map<string, Edge[]>();
    for (const [id, m] of out)
      result.set(
        id,
        [...m]
          .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
          .map(([label, list]) => ({
            label,
            notes: list.sort((a, b) => titleOf(a).localeCompare(titleOf(b))),
          })),
      );
    return result;
  });

  /** When a note last changed, from its content: created, any date in its body up to today, the newest daily note linking to it. */
  const updated = once(() => {
    const { lastSeen } = signals();
    const map = new Map<string, string>();
    for (const n of notes) {
      let best = writtenOf(n, t);
      const seen = lastSeen.get(n.id) ?? '';
      if (seen > best) best = seen;
      map.set(n.id, best);
    }
    return map;
  });

  return {
    notes,
    schema,
    byId,
    byHref,
    get backlinks() {
      return backlinks();
    },
    get signals() {
      return signals();
    },
    get topics() {
      return topics();
    },
    get graph() {
      return graph();
    },
    get updated() {
      return updated();
    },
  };
}

/** The graph of the files' notes, once per files (the host's change only when a file does). A broken
 * vocabulary file gives an empty one; notes says why (its `blocked`). */
const graphs = new WeakMap<VaultFile[], Graph>();
export function graphOf(files: VaultFile[]): Graph {
  let g = graphs.get(files);
  if (!g) {
    const schema = schemaFor(files);
    g = deriveGraph(notesOf(files).notes, schema instanceof Error ? NO_SCHEMA : schema);
    graphs.set(files, g);
  }
  return g;
}

/** A feature's own derived data, computed once per graph: `const datesOf = perGraph((v) => ...)`. */
export function perGraph<T>(f: (v: Graph) => T): (v: Graph) => T {
  const cache = new WeakMap<Graph, T>();
  return (v) => {
    if (!cache.has(v)) cache.set(v, f(v));
    return cache.get(v)!;
  };
}
