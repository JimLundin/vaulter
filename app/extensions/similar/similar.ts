// Similar notes: for each topical note, the notes whose text is most alike and that nothing connects yet.
// Slow (O(n²)); the app runs it in the worker (app/extensions/heavy.ts).
import { asList, titleOf, type Note } from '../notes/model/fields.ts';
import type { Backlink, Edge } from '../graph/model/graph.ts';

const STOP = new Set(
  (
    'the and for that with this from was are were has have had not but his her its into than then they them ' +
    'their there what when which who will would can could should about also been being more most some such only other over ' +
    "jim jim's see also note notes one two three all any each out new now use used using very just like get got does done " +
    'because while where after before between through under same own may might much many well even still back first last ' +
    'day days week weeks month months year years today tomorrow yesterday morning afternoon evening time times ' +
    'january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday ' +
    'owner vault capture later earlier current currently recent recently around about quite really thing things something make made way ' +
    'status open see based part whole good bad still going take took says said think thinks want wants wanted need needs'
  ).split(' '),
);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/https?:\S+/g, ' ')
    .replace(/[`*_>#|[\]{}()"“”]/g, ' ')
    .split(/[^a-zåäöé0-9'-]+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));

/**
 * For each topical note, the notes whose text is most alike (TF-IDF cosine over body, title, aliases,
 * summary and tags), leaving out notes it already links to, is linked from or relates to: the point is
 * connections nobody has written down yet.
 */
export function similarNotes(
  topical: Note[],
  backlinks: Map<string, Backlink[]>,
  g: Map<string, Edge[]>,
  limit = 5,
  min = 0.18,
) {
  const docs = topical.map((n) => {
    const d = n.data;
    const tags = asList(d.tags)
      .filter((t) => !t.startsWith('status/'))
      .map((t) => t.replace(/^\w+\//, '').replace(/-/g, ' '))
      .join(' ');
    const text = [
      titleOf(n),
      titleOf(n),
      asList(d.aliases).join(' '),
      d.summary ?? '',
      d.summary ?? '',
      d.summary ?? '',
      tags,
      tags,
      tags,
      n.body.replace(/^## See also[\s\S]*$/m, ''),
    ].join(' ');
    const tf = new Map<string, number>();
    for (const w of words(text)) tf.set(w, (tf.get(w) ?? 0) + 1);
    return tf;
  });
  const df = new Map<string, number>();
  for (const tf of docs) for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length;
  const vecs = docs.map((tf) => {
    const v = new Map<string, number>();
    let norm = 0;
    for (const [w, c] of tf) {
      if ((df.get(w) ?? 0) < 2) continue;
      const x = (1 + Math.log(c)) * Math.log(N / df.get(w)!);
      v.set(w, x);
      norm += x * x;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [w, x] of v) v.set(w, x / norm);
    return v;
  });
  const linked = (a: Note, b: Note) =>
    (backlinks.get(a.id) ?? []).some((l) => l.from.id === b.id) ||
    (backlinks.get(b.id) ?? []).some((l) => l.from.id === a.id) ||
    (g.get(a.id) ?? []).some((e) => e.notes.includes(b));
  const out: Record<string, { id: string; score: number }[]> = {};
  topical.forEach((a, i) => {
    const scores: { id: string; score: number }[] = [];
    topical.forEach((b, j) => {
      if (i === j) return;
      const [small, big] = vecs[i].size < vecs[j].size ? [vecs[i], vecs[j]] : [vecs[j], vecs[i]];
      let dot = 0;
      for (const [w, x] of small) dot += x * (big.get(w) ?? 0);
      if (dot >= min && !linked(a, b)) scores.push({ id: b.id, score: dot });
    });
    out[a.id] = scores.sort((x, y) => y.score - x.score).slice(0, limit);
  });
  return out;
}
