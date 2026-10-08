// What Home and its sidebar group show, derived once per vault: from each note's facet tags (area/,
// status/, circle/; conventions §3) and from what the daily log links to.
import type { Note } from '../notes/model/fields.ts';
import { facet, titleOf, kind, asList, hrefOf } from '../notes/model/fields.ts';
import { isTopical, perGraph, type Graph } from '../graph/model/graph.ts';
import type { Area, Schema } from '../notes/model/schema.ts';
import { dateStr } from '../../core/format.ts';

/** An area as Home shows it: its notes (people aside), its hub, and what in it is active now. */
export interface AreaView extends Omit<Area, 'hub'> {
  hub?: Note;
  notes: Note[];
  active: Note[];
}

export const home = perGraph((v: Graph) => {
  const { lastSeen, degree } = v.signals;
  const topical = v.notes.filter(isTopical);
  const seen = (n: Note) => lastSeen.get(n.id) ?? '';
  const byTitle = (a: Note, b: Note) => titleOf(a).localeCompare(titleOf(b));
  const byWeight = (a: Note, b: Note) =>
    (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || byTitle(a, b);
  const bySeen = (a: Note, b: Note) =>
    (seen(b) || dateStr(b.data.created)).localeCompare(seen(a) || dateStr(a.data.created)) ||
    byWeight(a, b);
  const isActive = (n: Note) => facet(n, 'status') === 'active';
  // In focus: active outside leisure (what Jim reads or plays shows under Leisure), most recently logged first.
  const active = topical.filter((n) => isActive(n) && facet(n, 'area') !== 'leisure').sort(bySeen);
  const dailies = v.notes
    .filter((n) => kind(n.id) === 'daily')
    .sort((a, b) => b.id.localeCompare(a.id));
  // Recently touched: anything else the log mentioned in the 14 days before its latest entry.
  const latest = dailies[0]?.id.slice(6) ?? '';
  const cutoff = latest ? new Date(Date.parse(latest) - 14 * 864e5).toISOString().slice(0, 10) : '';
  const recent = topical
    .filter((n) => !active.includes(n) && seen(n) && seen(n) >= cutoff)
    .sort((a, b) => seen(b).localeCompare(seen(a)) || byWeight(a, b))
    .slice(0, 14);
  const areas: AreaView[] = v.schema.areas.map((a) => {
    const hub = a.hub ? v.byId.get(a.hub) : undefined;
    const notes = topical.filter((n) => facet(n, 'area') === a.key && n.data.type !== 'person');
    return { ...a, hub, notes, active: notes.filter((n) => n !== hub && isActive(n)).sort(bySeen) };
  });
  const people = topical.filter((n) => n.data.type === 'person' && facet(n, 'circle'));
  const untagged = topical
    .filter((n) => !(facet(n, 'area') || (n.data.type === 'person' && facet(n, 'circle'))))
    .sort(byTitle);
  // Every open question, by note: active things first, then by how many are open.
  const questions = topical
    .map((n) => ({ n, q: asList(n.data.open) }))
    .filter((x) => x.q.length)
    .sort(
      (a, b) =>
        Number(isActive(b.n)) - Number(isActive(a.n)) ||
        b.q.length - a.q.length ||
        byTitle(a.n, b.n),
    );
  return { seen, byWeight, active, dailies, recent, areas, people, untagged, questions };
});

/** Notes grouped by type, in the schema's order, each group by status then weight. */
export const byType = (
  { types, statusRank }: Schema,
  list: Note[],
  byWeight: (a: Note, b: Note) => number,
) => {
  const known = new Set(types.map((t) => t.key));
  return [...types, { key: '', label: 'Other' }]
    .map((t) => ({
      label: t.label,
      items: list
        .filter((n) => (t.key ? n.data.type === t.key : !known.has(n.data.type)))
        .sort(
          (a, b) =>
            statusRank(facet(a, 'status')) - statusRank(facet(b, 'status')) || byWeight(a, b),
        ),
    }))
    .filter((g) => g.items.length);
};

/** Where an area leads (a site href): its hub note, or its tab on Home. */
export const areaHref = (a: AreaView) => (a.hub ? hrefOf(a.hub) : `/#${a.key}`);
