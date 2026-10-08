// The daily brief at the top of Home, for the day it is opened: today and the week ahead, follow-ups due
// first, one open question from a live note, and the log a week, a month, three months and a year back.
import type { Note } from '../notes/model/fields.ts';
import { facet, kind, plain, titleOf } from '../notes/model/fields.ts';
import { type Graph } from '../graph/model/graph.ts';
import { isTopical } from '../notes/model/fields.ts';
import { datesOf, followUpsOf, openOf, type DateFact } from '../notes/model/facts.ts';

const DAY = 864e5;
const addDays = (d: string, n: number) =>
  new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const monthsAgo = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() - n);
  return x.toISOString().slice(0, 10);
};

/** A daily note's first bullet, as the look back shows it. */
const gist = (n: Note) => {
  const first = plain(n.body.split('\n').find((l) => /^\s*[-*] /.test(l)) ?? '').replace(
    /\s*Raw: captures\/\S+$/,
    '',
  );
  return first.length > 220 ? `${first.slice(0, 219).trimEnd()}…` : first;
};

export function computeBrief(v: Graph, today: string) {
  const topical = v.notes.filter(isTopical);
  const week = addDays(today, 7);
  const on: DateFact[] = [];
  const soon: DateFact[] = [];
  for (const x of topical.flatMap(datesOf)) {
    let d = x.date;
    if (d.length !== 10) continue;
    if (x.yearly) {
      d = today.slice(0, 4) + d.slice(4);
      if (d < today) d = String(+today.slice(0, 4) + 1) + d.slice(4);
    }
    const item = { ...x, date: d };
    if (d === today || (x.end && d < today && x.end >= today)) on.push(item);
    else if (d > today && d <= week) soon.push(item);
  }
  soon.sort((a, b) => a.date.localeCompare(b.date) || a.what.localeCompare(b.what));
  const fus = topical
    .flatMap((n) => followUpsOf(n, v.byId, today))
    .sort(
      (a, b) => Number(b.due) - Number(a.due) || (a.by || '9999').localeCompare(b.by || '9999'),
    );
  // One question from what is live (active, or in the log in the last 14 days): rotate over notes, then
  // over each note's questions, so one note with many questions doesn't crowd out the rest.
  const recent = addDays(today, -14);
  const turn = Math.floor(Date.parse(today) / DAY);
  const seen = v.signals.lastSeen;
  const live = topical
    .filter(
      (n) =>
        openOf(n).length && (facet(n, 'status') === 'active' || (seen.get(n.id) ?? '') >= recent),
    )
    .sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  const pick = live.length ? live[turn % live.length] : null;
  const question = pick
    ? { q: openOf(pick)[Math.floor(turn / live.length) % openOf(pick).length], note: pick }
    : null;
  const days = new Map(
    v.notes.filter((n) => kind(n.id) === 'daily').map((n) => [n.id.slice(6), n]),
  );
  const back = (
    [
      ['A week ago', addDays(today, -7)],
      ['A month ago', monthsAgo(today, 1)],
      ['Three months ago', monthsAgo(today, 3)],
      ['A year ago', monthsAgo(today, 12)],
    ] as const
  ).flatMap(([label, d]) => {
    const n = days.get(d);
    return n ? [{ label, note: n, text: gist(n) }] : [];
  });
  return { today, on, soon, fus, question, back };
}
