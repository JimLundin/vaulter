// Where a note's fields name other notes (meta/conventions.md §3): its relations, a place it was at, who a
// follow-up or a decision is with, the notes a capture's exchange was filed into. Notes reads them from the
// frontmatter; the graph connects them and checks they resolve.
import { dateStr } from '../format.ts';
import { asList, type Note } from './fields.ts';

/** A relation as the note states it: the predicate (meta/schema.yaml) and the notes it names. */
export const relationsOf = (n: Note): { predicate: string; targets: string[] }[] => {
  const rel = n.data.relations;
  return rel && typeof rel === 'object' && !Array.isArray(rel)
    ? Object.entries(rel).map(([predicate, t]) => ({
        predicate,
        targets: (Array.isArray(t) ? t : [t]).map(String),
      }))
    : [];
};

/** One place a field names a note: `at` names the field for a problem ("Ada: works-at", "captures/…:
 * exchange 2: topics"), `hint` how to name a note there. */
export interface Ref {
  from: Note;
  at: string;
  target: string;
  /** The relation's predicate, when it is one. */
  predicate?: string;
  hint: string;
}

const NOTE_HINT = ' (use the filename without extension)';

/** Every note a note's fields name. Logs and captures say where and who as the topical notes do; a
 * capture's `where` may be free text (an unresolved place), so only its exchanges' topics count. */
export function refsOf(n: Note): Ref[] {
  const out: Ref[] = [];
  const add = (at: string, target: unknown, hint = '', predicate?: string) =>
    out.push({ from: n, at, target: String(target), hint, ...(predicate && { predicate }) });
  const d = n.data;
  if (n.id.startsWith('captures/')) {
    const exchanges: unknown[] = Array.isArray(d.exchanges) ? d.exchanges : [];
    for (const [i, x] of exchanges.entries())
      if (x && typeof x === 'object' && !Array.isArray(x))
        for (const t of asList((x as Record<string, unknown>).topics))
          add(
            `${n.path}: exchange ${i + 1}: topics`,
            t,
            ' (renamed? use the current filename without extension)',
          );
    return out;
  }
  if (n.id.includes('/') && !n.id.startsWith('daily/')) return out;
  for (const { predicate, targets } of relationsOf(n))
    for (const t of targets) add(`${n.id}: ${predicate}`, t, NOTE_HINT, predicate);
  if (Array.isArray(d.dates))
    for (const x of d.dates)
      if (x?.where != null) add(`${n.id}: date ${dateStr(x?.date)} where`, x.where);
  if (Array.isArray(d.where)) for (const w of d.where) add(`${n.id}: where`, w, NOTE_HINT);
  if (Array.isArray(d['follow-ups']))
    for (const f of d['follow-ups']) if (f?.who != null) add(`${n.id}: follow-up who`, f.who);
  if (Array.isArray(d.decisions))
    for (const x of d.decisions)
      if (x?.who != null) add(`${n.id}: decision ${dateStr(x?.date)} who`, x.who);
  return out;
}
