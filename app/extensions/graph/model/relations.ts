// Relations and the other structured frontmatter (meta/conventions.md §3): the checks. The predicates
// are the vault's own, in meta/schema.yaml (app/extensions/notes/model/schema.ts reads them): a note states a relation once,
// the viewer shows it on both notes, the target's side under the inverse label.

import type { Frontmatter } from '../../notes/model/note.ts';
import { dateStr } from '../../../core/format.ts';

export interface Predicate {
  label: string;
  inverse?: string;
  symmetric?: boolean;
  use: string;
}

/** Dates: "2026", "2026-09" or "2026-09-28". */
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/**
 * Problems with one note's relations, dates and places, given the set of note ids (filename stems).
 * Used by the link check, so a bad relation fails the build like a broken link.
 */
export function checkMeta(
  id: string,
  data: Frontmatter,
  ids: Set<string>,
  predicates: Record<string, Predicate>,
) {
  const out: string[] = [];
  const rel = data.relations;
  if (rel != null) {
    if (typeof rel !== 'object' || Array.isArray(rel))
      out.push(`${id}: relations must be a map of predicate → [notes]`);
    else
      for (const [p, targets] of Object.entries(rel)) {
        if (!predicates[p]) out.push(`${id}: unknown relation "${p}" (see meta/schema.yaml)`);
        for (const t of Array.isArray(targets) ? targets : [targets])
          if (!ids.has(String(t)))
            out.push(`${id}: ${p} → "${t}" is not a note (use the filename without extension)`);
          else if (String(t) === id) out.push(`${id}: ${p} → itself`);
      }
  }
  if (data.dates != null) {
    if (!Array.isArray(data.dates)) out.push(`${id}: dates must be a list`);
    else
      for (const d of data.dates) {
        const s = dateStr(d?.date);
        const e = dateStr(d?.end);
        if (!DATE_RE.test(s)) out.push(`${id}: date "${s}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
        if (e && !DATE_RE.test(e)) out.push(`${id}: end "${e}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
        if (!d?.what) out.push(`${id}: date ${s} has no "what"`);
        if (d?.repeat && d.repeat !== 'yearly') out.push(`${id}: repeat must be "yearly"`);
        if (d?.where != null && !ids.has(String(d.where)))
          out.push(`${id}: date ${s} where → "${d.where}" is not a note`);
      }
  }
  // Places (conventions §3, "Places"). Captures may hold unresolved `where` as free text.
  if (data.geo != null) {
    const { lat, lon } = data.geo ?? {};
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      out.push(`${id}: geo must be {lat: <number>, lon: <number>} in decimal degrees`);
    if (data.geo?.precision != null && data.geo.precision !== 'street')
      out.push(`${id}: geo precision can only be "street"`);
  }
  if (data.address != null && typeof data.address !== 'string')
    out.push(`${id}: address must be text`);
  if (data.where != null && !id.startsWith('captures/')) {
    if (!Array.isArray(data.where)) out.push(`${id}: where must be a list of place notes`);
    else
      for (const w of data.where)
        if (!ids.has(String(w)))
          out.push(`${id}: where → "${w}" is not a note (use the filename without extension)`);
  }
  // Follow-ups (conventions §3, "Follow-ups"): {what, by?, who?}.
  const fu = data['follow-ups'];
  if (fu != null) {
    if (!Array.isArray(fu)) out.push(`${id}: follow-ups must be a list`);
    else
      for (const f of fu) {
        if (!f?.what) out.push(`${id}: follow-up has no "what"`);
        const by = dateStr(f?.by);
        if (by && !DATE_RE.test(by))
          out.push(`${id}: follow-up by "${by}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
        if (f?.who != null && !ids.has(String(f.who)))
          out.push(`${id}: follow-up who → "${f.who}" is not a note`);
      }
  }
  // Decisions (conventions §3, "Decisions"): {date, what, why?, who?}.
  const dec = data.decisions;
  if (dec != null) {
    if (!Array.isArray(dec)) out.push(`${id}: decisions must be a list`);
    else
      for (const x of dec) {
        const s = dateStr(x?.date);
        if (!DATE_RE.test(s))
          out.push(`${id}: decision date "${s}" is not YYYY, YYYY-MM or YYYY-MM-DD`);
        if (!x?.what) out.push(`${id}: decision ${s} has no "what"`);
        if (x?.why != null && typeof x.why !== 'string')
          out.push(`${id}: decision ${s} why must be text`);
        if (x?.who != null && !ids.has(String(x.who)))
          out.push(`${id}: decision ${s} who → "${x.who}" is not a note`);
      }
  }
  if (data.open != null && !Array.isArray(data.open))
    out.push(`${id}: open must be a list of questions`);
  if (data.summary != null && typeof data.summary !== 'string')
    out.push(`${id}: summary must be one sentence of text`);
  return out;
}
