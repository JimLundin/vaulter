// The structured fields' shapes (meta/conventions.md §3): relations, dates, places, follow-ups, decisions.
// Whether the notes they name exist is the graph's check (app/extensions/graph/model/check.ts).
import type { Frontmatter } from './note.ts';
import { dateStr } from '../../../core/format.ts';

/** Dates: "2026", "2026-09" or "2026-09-28". */
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/** Problems with the shape of one note's structured fields. */
export function checkFields(id: string, data: Frontmatter) {
  const out: string[] = [];
  const rel = data.relations;
  if (rel != null && (typeof rel !== 'object' || Array.isArray(rel)))
    out.push(`${id}: relations must be a map of predicate → [notes]`);
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
  if (data.where != null && !id.startsWith('captures/') && !Array.isArray(data.where))
    out.push(`${id}: where must be a list of place notes`);
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
      }
  }
  if (data.open != null && !Array.isArray(data.open))
    out.push(`${id}: open must be a list of questions`);
  if (data.summary != null && typeof data.summary !== 'string')
    out.push(`${id}: summary must be one sentence of text`);
  return out;
}
