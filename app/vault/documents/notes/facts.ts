// The dated facts a note's frontmatter states (meta/conventions.md §3): dates, follow-ups, decisions.
// Read from one note; the features that show them (calendar, decisions, Today, the note page) gather them.
import { asList, type Note } from './fields.ts';
import { dateStr, lastDay, today } from '../format.ts';

export interface DateFact {
  date: string;
  end: string;
  what: string;
  where: string;
  yearly: boolean;
  note: Note;
}
export interface FollowUp {
  what: string;
  by: string;
  who: Note | null;
  whoName: string;
  note: Note;
  due: boolean;
  late: boolean;
}
export interface Decision {
  date: string;
  what: string;
  why: string;
  who: Note | null;
  note: Note;
}

const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export const datesOf = (n: Note): DateFact[] =>
  list(n.data.dates)
    .map((d) => ({
      date: dateStr(d?.date),
      end: dateStr(d?.end),
      what: String(d?.what ?? ''),
      where: d?.where == null ? '' : String(d.where),
      yearly: d?.repeat === 'yearly',
      note: n,
    }))
    .filter((d) => d.date);

/** `due` when `by` is today or past (a month or year counts as its last day); `late` when it's past. */
export const followUpsOf = (n: Note, byId: Map<string, Note>, t = today()): FollowUp[] =>
  list(n.data['follow-ups']).map((f) => {
    const by = dateStr(f?.by);
    const who = f?.who == null ? '' : String(f.who);
    return {
      what: String(f?.what ?? ''),
      by,
      who: byId.get(who) ?? null,
      whoName: who,
      note: n,
      due: !!by && lastDay(by) <= t,
      late: !!by && lastDay(by) < t,
    };
  });

/** Newest first. */
export const decisionsOf = (n: Note, byId: Map<string, Note>): Decision[] =>
  list(n.data.decisions)
    .map((x) => ({
      date: dateStr(x?.date),
      what: String(x?.what ?? ''),
      why: String(x?.why ?? ''),
      who: byId.get(String(x?.who)) ?? null,
      note: n,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

export const openOf = (n: Note) => asList(n.data.open);
