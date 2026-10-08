// Every dated entry as an occurrence; yearly ones repeat for each year in a range.
import { datesOf, type DateFact } from '../notes/model/facts.ts';
import type { Graph } from '../graph/model/graph.ts';

export interface Occurrence extends DateFact {}

export const occurrences = (v: Graph, fromYear: number, toYear: number): Occurrence[] =>
  v.notes
    .flatMap(datesOf)
    .flatMap((d) => {
      if (!d.yearly || d.date.length !== 10) return [d];
      const out: Occurrence[] = [];
      for (let y = Math.max(fromYear, +d.date.slice(0, 4)); y <= toYear; y++)
        out.push({ ...d, date: `${y}${d.date.slice(4)}`, end: '' });
      return out;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.what.localeCompare(b.what));
