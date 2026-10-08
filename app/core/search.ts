// Search and link previews over entries the features contribute (notes, topics, pages), by href.
// Ranking: topics first, then titles and aliases, then a matching tag, then the summary.

/** t title, e excerpt, a aliases, k kind ("note", "daily", "topic", "page", …), g topics; n notes in a topic. */
export interface Entry {
  href: string;
  t: string;
  e: string;
  a: string[];
  k: string;
  g: string[];
  n?: number;
}
export interface Hit {
  entry: Entry;
  score: number;
  why: string;
}

export const searchIndex = (entries: Entry[]) => new Map(entries.map((e) => [e.href, e]));

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .trim();
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const score = (n: Entry, term: string) => {
  if (n.k === 'topic') {
    const w = words(n.t);
    return w === term
      ? -2
      : w.startsWith(term)
        ? -1
        : term.length >= 3 && w.split(' ').some((x) => x.startsWith(term))
          ? 1.5
          : 9;
  }
  const t = n.t.toLowerCase();
  if (t.startsWith(term)) return 0;
  const at = new RegExp(`(^|[^a-z0-9])${escRe(term)}`);
  if (at.test(t)) return 1;
  if (t.includes(term)) return 3.5;
  if (n.a.some((a) => at.test(a.toLowerCase()))) return 2;
  return n.g.some((g) => words(g) === term || (term.length >= 3 && words(g).startsWith(term)))
    ? 3
    : n.k === 'note' && term.length >= 3 && new RegExp(`\\b${escRe(term)}`).test(n.e.toLowerCase())
      ? 4
      : 9;
};

/** The best ten: at most three topics, then everything else by score. */
export function search(index: Map<string, Entry>, query: string): Hit[] {
  const term = words(query);
  if (!term) return [];
  const all = [...index.values()]
    .map((entry) => ({ entry, score: score(entry, term) }))
    .filter((h) => h.score < 9)
    .sort(
      (a, b) =>
        a.score - b.score ||
        (b.entry.n ?? 0) - (a.entry.n ?? 0) ||
        (a.entry.k === 'note' ? -1 : 1) - (b.entry.k === 'note' ? -1 : 1) ||
        a.entry.t.localeCompare(b.entry.t),
    );
  return [
    ...all.filter((h) => h.entry.k === 'topic').slice(0, 3),
    ...all.filter((h) => h.entry.k !== 'topic'),
  ]
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)
    .map((h) => ({
      ...h,
      why:
        h.entry.k === 'topic'
          ? h.entry.e
          : h.score === 2
            ? (h.entry.a.find((a) => a.toLowerCase().includes(term)) ?? '')
            : h.score === 3
              ? `#${h.entry.g.find((g) => words(g).startsWith(term))}`
              : h.score === 4
                ? 'in summary'
                : '',
    }));
}
