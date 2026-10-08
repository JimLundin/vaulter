// What a note says about itself: title, excerpt, facets, topics. Pure functions of one note.
import { hrefForId, slugify } from './paths.ts';
import type { Frontmatter } from './note.ts';

/** A page of the vault, as parsed by app/extensions/notes/model/note.ts. */
export interface Note {
  id: string;
  path: string;
  ext: 'md' | 'mdx';
  data: Frontmatter;
  body: string;
}

/** Markdown line -> readable plain text (links become their labels). */
export const plain = (s: string) =>
  s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/(^|[\s(])\*(\S[^*]*)\*/g, '$1$2')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
    .replace(/^#+\s*/, '')
    .replace(/<[^>]+>/g, '')
    .trim();

export const clip = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

export const kind = (id: string) =>
  id.startsWith('daily/')
    ? 'daily'
    : id.startsWith('captures/')
      ? 'capture'
      : id.startsWith('meta/')
        ? 'meta'
        : 'note';

export function titleOf(n: Note): string {
  const m = n.body.match(/^#\s+(.+)$/m);
  return m ? plain(m[1]) : n.id.split('/').pop()!;
}

/** The note's summary (frontmatter), else its first prose paragraph after the title. */
export function excerptOf(n: Note, max = 240): string {
  const sum = n.data.summary;
  if (typeof sum === 'string' && sum.trim()) return clip(sum.trim(), max);
  let fence = false;
  for (const raw of n.body.split('\n')) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence || !line || /^(#|\||>|---|import |export |<[A-Z]|\{\/\*)/.test(line)) continue;
    return clip(plain(line), max);
  }
  return '';
}

export const hrefOf = (n: Pick<Note, 'id'>) => hrefForId(n.id);

/** Facet tags (meta/conventions.md §3): "area/work" -> "work" for the facet "area". */
export const facet = (n: Note, name: 'area' | 'status' | 'circle') =>
  asList(n.data.tags)
    .find((t) => t.startsWith(`${name}/`))
    ?.slice(name.length + 1) ?? '';

export const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)];

/** Topic names a note is findable by: every plain tag, plus its area/ and circle/ values (not status/). */
export const topicsOf = (n: Note) => [
  ...new Set(
    asList(n.data.tags)
      .filter((t) => !t.startsWith('status/'))
      .map((t) => t.replace(/^(area|circle)\//, '')),
  ),
];

export const topicHref = (t: string) => `/topic/${slugify(t)}/`;
