// Vault pages as Wiki trees: a page's body becomes sections, blocks and inline nodes, its MDX
// components the records they display, and its frontmatter relationships, dates, questions,
// decisions and tasks. Consecutive revisions are matched so an edit keeps its nodes' identities.
import GithubSlugger from 'github-slugger';
import { CORE_SCHEMA, load } from 'js-yaml';
import type { List, ListItem, PhrasingContent, RootContent } from 'mdast';
import { toString as textOf } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { JsonObject, JsonValue } from '../../app/vault/nodes/model.ts';
import { hash } from './keys.ts';
import { asObject, type Data, json, list, type Ref } from './records.ts';
import { report, tally } from './report.ts';

export const markdown = unified().use(remarkParse).use(remarkGfm);
export const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/** A node of one revision of a page, before identities and order are assigned. */
export interface Tree {
  data: Data;
  children: Tree[];
  target?: Ref;
  /** What identifies it among revisions: its own text, else its children's. */
  sig: string;
  /** Records from frontmatter carry a natural key instead of being matched. */
  natural?: string;
  key?: string;
}
const node = (data: Data, children: Tree[] = [], sig = '', target?: Ref): Tree => ({
  data,
  children,
  sig,
  ...(target ? { target } : {}),
});
export const sigOf = (tree: Tree): string => tree.sig || tree.children.map(sigOf).join(' ');
const textContainer = (kind: string, inline: Tree[]) => node({ kind }, inline);

// ---- Inline ---------------------------------------------------------------------------------------

type Mark = 'strong' | 'emphasis' | 'code' | 'strike';
const MARKS: ReadonlySet<JsonValue> = new Set<Mark>(['strong', 'emphasis', 'code', 'strike']);
const marksOf = (data: Data): Mark[] | undefined =>
  Array.isArray(data.marks) ? data.marks.filter((m): m is Mark => MARKS.has(m)) : undefined;
const marksKey = (data: Data) => (Array.isArray(data.marks) ? data.marks.join() : '');
const textField = (data: Data): string => (typeof data.text === 'string' ? data.text : '');

const WIKI_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
export function linkTarget(url: string): Ref {
  if (/^(https?|mailto|tel):/i.test(url)) return { resource: url };
  let decoded = url;
  try {
    decoded = decodeURI(url);
  } catch {
    // A malformed escape: the link stays as written.
  }
  const [path, anchor] = decoded.replace(/^\//, '').split('#'); // '#anchor' alone: this page
  return { path: path!, ...(anchor ? { anchor } : {}) };
}
/** Inline Markdown as runs and links. Wikilinks are found in merged runs, since remark splits
 * their brackets into separate text. */
function inlineOf(nodes: readonly PhrasingContent[], marks: Mark[] = []): Tree[] {
  return inlineRuns(nodes, marks).flatMap((t) => {
    const text = textField(t.data);
    if (t.data.kind !== 'run' || !text.includes('[[')) return [t];
    const out: Tree[] = [];
    const m = marksOf(t.data);
    let at = 0;
    for (const w of text.matchAll(WIKI_RE)) {
      const before = text.slice(at, w.index);
      if (before)
        out.push(node({ kind: 'run', text: before, ...(m ? { marks: m } : {}) }, [], before));
      const name = w[1]!.trim();
      const label = (w[3] ?? w[1]!).trim();
      const target: Ref = w[1]!.startsWith('captures/')
        ? { path: name, ...(w[2] ? { anchor: w[2] } : {}) }
        : w[2]
          ? { path: `${name}.md`, anchor: w[2] }
          : { page: name };
      out.push(
        node(
          { kind: 'link', text: label, ...(m ? { marks: m } : {}) },
          [],
          `${label} ${w[0]}`,
          target,
        ),
      );
      at = w.index + w[0].length;
    }
    const after = text.slice(at);
    if (after) out.push(node({ kind: 'run', text: after, ...(m ? { marks: m } : {}) }, [], after));
    return out;
  });
}
function inlineRuns(nodes: readonly PhrasingContent[], marks: Mark[] = []): Tree[] {
  const out: Tree[] = [];
  const run = (text: string, m: Mark[]) => {
    if (!text) return;
    const last = out.at(-1);
    if (last?.data.kind === 'run' && marksKey(last.data) === m.join()) {
      last.data.text = textField(last.data) + text;
      last.sig = textField(last.data);
    } else out.push(node({ kind: 'run', text, ...(m.length ? { marks: [...m] } : {}) }, [], text));
  };
  const withMark = (m: Mark) => (marks.includes(m) ? marks : [...marks, m]);
  for (const n of nodes) {
    if (n.type === 'text') run(n.value, marks);
    else if (n.type === 'strong')
      out.push(...mergeInto(out, inlineRuns(n.children, withMark('strong'))));
    else if (n.type === 'emphasis')
      out.push(...mergeInto(out, inlineRuns(n.children, withMark('emphasis'))));
    else if (n.type === 'delete')
      out.push(...mergeInto(out, inlineRuns(n.children, withMark('strike'))));
    else if (n.type === 'inlineCode') run(n.value, withMark('code'));
    else if (n.type === 'break') run('\n', marks);
    else if (n.type === 'link') {
      const text = textOf(n) || n.url;
      out.push(
        node(
          { kind: 'link', text, ...(marks.length ? { marks: [...marks] } : {}) },
          [],
          `${text} ${n.url}`,
          linkTarget(n.url),
        ),
      );
    } else {
      tally(report.unsupported, `inline:${n.type}`);
      run(textOf(n) || ('value' in n ? n.value : ''), marks);
    }
  }
  return out;
}
// Adjacent runs with equal marks merge across nested formatting.
function mergeInto(out: Tree[], next: Tree[]): Tree[] {
  const [first] = next;
  const last = out.at(-1);
  if (
    first &&
    last &&
    first.data.kind === 'run' &&
    last.data.kind === 'run' &&
    marksKey(first.data) === marksKey(last.data)
  ) {
    last.data.text = textField(last.data) + textField(first.data);
    last.sig = textField(last.data);
    return next.slice(1);
  }
  return next;
}

// ---- Blocks ---------------------------------------------------------------------------------------

/** A body's top-level content: Markdown blocks, and MDX components already converted. */
type Flow = RootContent | { type: 'component'; tree: Tree };

/** A Markdown block other than a heading, as Wiki nodes; null when it has no Wiki kind. */
function blockOf(n: Flow): Tree | null {
  if (n.type === 'component') return n.tree;
  if (n.type === 'paragraph') return textContainer('paragraph', inlineOf(n.children));
  if (n.type === 'list') return listOf(n);
  if (n.type === 'blockquote') return node({ kind: 'quote' }, n.children.flatMap(blockOrText));
  if (n.type === 'code')
    return node(
      { kind: 'code', ...(n.lang ? { language: n.lang } : {}), text: n.value },
      [],
      n.value,
    );
  if (n.type === 'thematicBreak') return node({ kind: 'rule' }, [], 'rule');
  if (n.type === 'table')
    return node(
      { kind: 'table' },
      n.children.map((row) =>
        node(
          { kind: 'row' },
          row.children.map((cell, i) => {
            const align = n.align?.[i];
            return node({ kind: 'cell', ...(align ? { align } : {}) }, inlineOf(cell.children));
          }),
        ),
      ),
    );
  return null;
}
/** A block, or its text as a paragraph when it has no Wiki kind (reported). */
function blockOrText(n: Flow): Tree[] {
  if (n.type === 'heading') {
    tally(report.unsupported, 'block:heading-inside-block');
    return [textContainer('paragraph', inlineOf(n.children))];
  }
  const block = blockOf(n);
  if (block) return [block];
  tally(report.unsupported, `block:${n.type}`);
  if (n.type === 'component') return [];
  const text = textOf(n) || ('value' in n ? n.value : '');
  return text ? [textContainer('paragraph', [node({ kind: 'run', text }, [], text)])] : [];
}
/** An item holds its first paragraph's inline nodes, then the rest of its blocks in order. */
function listOf(items: List): Tree {
  return node(
    { kind: 'list', ordered: !!items.ordered },
    items.children.map((item: ListItem) => {
      if (item.checked !== null && item.checked !== undefined)
        tally(report.unsupported, 'block:task-list-item');
      const [first, ...rest] = item.children;
      const inline = first?.type === 'paragraph' ? inlineOf(first.children) : [];
      const blocks = (first?.type === 'paragraph' ? rest : item.children).flatMap(blockOrText);
      return node({ kind: 'item' }, [...inline, ...blocks]);
    }),
  );
}

// ---- MDX components -------------------------------------------------------------------------------

// MDX props are literal values only (conventions §13): parse them without evaluating anything.
function literal(src: string): JsonValue {
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };
  const escapes: Record<string, string> = { n: '\n', t: '\t' };
  const str = () => {
    const quote = src[i++]!;
    let out = '';
    while (src[i] !== quote) {
      if (i >= src.length) throw new Error('unterminated string');
      if (src[i] === '\\') {
        i++;
        out += escapes[src[i]!] ?? src[i];
      } else out += src[i];
      i++;
    }
    i++;
    return out;
  };
  const value = (): JsonValue => {
    ws();
    const c = src[i];
    if (c === '"' || c === "'") return str();
    if (c === '[') {
      i++;
      const items: JsonValue[] = [];
      for (ws(); src[i] !== ']'; ws()) {
        if (i >= src.length) throw new Error('unterminated [');
        items.push(value());
        ws();
        if (src[i] === ',') i++;
      }
      i++;
      return items;
    }
    if (c === '{') {
      i++;
      const fields: Record<string, JsonValue> = {};
      for (ws(); src[i] !== '}'; ws()) {
        if (i >= src.length) throw new Error('unterminated {');
        let key: string;
        if (src[i] === '"' || src[i] === "'") key = str();
        else {
          const name = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
          if (!name) throw new Error(`unexpected ${src.slice(i, i + 10)}`);
          [key] = name;
          i += key.length;
        }
        ws();
        if (src[i++] !== ':') throw new Error('expected :');
        fields[key] = value();
        ws();
        if (src[i] === ',') i++;
      }
      i++;
      return fields;
    }
    const m = /^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null)/.exec(src.slice(i));
    if (!m) throw new Error(`unexpected ${src.slice(i, i + 10)}`);
    i += m[0].length;
    return JSON.parse(m[0]) as JsonValue;
  };
  const result = value();
  ws();
  if (i !== src.length) throw new Error('trailing input');
  return result;
}
function propsOf(tag: string): JsonObject {
  const out: Record<string, JsonValue> = {};
  const end = tag.lastIndexOf('/>');
  let i = /^\s*<[A-Z]\w*/.exec(tag)![0].length;
  while (i < end) {
    const m = /^\s*([A-Za-z][\w-]*)(=?)/.exec(tag.slice(i, end));
    if (!m) break;
    const name = m[1]!;
    i += m[0].length;
    if (!m[2]) out[name] = true;
    else if (tag[i] === '"' || tag[i] === "'") {
      const close = tag.indexOf(tag[i]!, i + 1);
      out[name] = tag.slice(i + 1, close);
      i = close + 1;
    } else {
      let depth = 0;
      let j = i;
      let quote: string | null = null;
      for (; j < end; j++) {
        const c = tag[j]!;
        if (quote) {
          if (c === '\\') j++;
          else if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      out[name] = literal(tag.slice(i + 1, j).trim());
      i = j + 1;
    }
  }
  return out;
}
/** A component becomes the records it displays. */
function componentOf(tag: string): Tree {
  const name = /<([A-Z]\w*)/.exec(tag)![1]!;
  const p = propsOf(tag);
  if (name === 'Chart')
    return node(
      {
        kind: 'chart',
        chart: p.kind ?? null,
        title: p.title ?? null,
        ...(p.unit ? { unit: p.unit } : {}),
        x: p.x ?? null,
        series: p.series ?? null,
      },
      [],
      String(p.title),
    );
  if (name === 'Timeline')
    return node(
      { kind: 'timeline' },
      list(p.items).map((value) => {
        const item = asObject(value);
        const date = node(
          { kind: 'date', date: item.date ?? null, label: item.text ?? null },
          [],
          `${String(item.date)} ${String(item.text)}`,
        );
        if (typeof item.href === 'string')
          date.children.push(
            node(
              { kind: 'relationship', predicate: 'about' },
              [],
              item.href,
              linkTarget(item.href),
            ),
          );
        return date;
      }),
    );
  if (name === 'NoteList')
    return node(
      {
        kind: 'query',
        ...(p.type ? { type: p.type } : {}),
        ...(p.tag ? { tag: p.tag } : {}),
        ...(p.sort ? { sort: p.sort } : {}),
      },
      [],
      JSON.stringify(p),
    );
  throw new Error(`Unknown component <${name}>`);
}

/** Markdown and MDX component segments of a body, in order. */
function segments(body: string, mdx: boolean): ({ markdown: string } | { component: string })[] {
  if (!mdx) return [{ markdown: body }];
  const out: ({ markdown: string } | { component: string })[] = [];
  let md: string[] = [];
  let tag: string[] | null = null;
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const f = FENCE_RE.exec(line);
    if (tag) {
      tag.push(line);
      if (/\/>\s*$/.test(line)) {
        out.push({ component: tag.join('\n') });
        tag = null;
      }
      continue;
    }
    if (f) {
      const marker = f[1]![0]!;
      fence = fence === null ? marker : fence === marker ? null : fence;
    }
    if (fence === null && !f && /^\s*<[A-Z]/.test(line)) {
      out.push({ markdown: md.join('\n') });
      md = [];
      tag = [line];
      if (/\/>\s*$/.test(line)) {
        out.push({ component: line });
        tag = null;
      }
      continue;
    }
    md.push(line);
  }
  out.push({ markdown: md.join('\n') });
  return out;
}
const withoutComments = (text: string, mdx: boolean) =>
  mdx ? text.replace(/\{\/\*[\s\S]*?\*\/\}/g, '') : text;

/** A body's blocks, with sections nested by heading depth; the first H1 is the page's title. */
function blocksOf(
  body: string,
  mdx: boolean,
): { title: string | null; blocks: Tree[]; slugs: Map<string, Tree> } {
  const flat: Flow[] = [];
  for (const s of segments(body, mdx))
    if ('component' in s) flat.push({ type: 'component', tree: componentOf(s.component) });
    else flat.push(...markdown.parse(withoutComments(s.markdown, mdx)).children);
  const root: Tree[] = [];
  const stack: { depth: number; tree: Tree }[] = [];
  const slugger = new GithubSlugger();
  const slugs = new Map<string, Tree>();
  let title: string | null = null;
  const into = () => stack.at(-1)?.tree.children ?? root;
  for (const n of flat) {
    if (n.type === 'heading') {
      const slug = slugger.slug(textOf(n));
      if (n.depth === 1 && title === null && !root.length && !stack.length) {
        title = textOf(n);
        continue;
      }
      while (stack.length && stack.at(-1)!.depth >= n.depth) stack.pop();
      const section = node({ kind: 'section' }, [textContainer('heading', inlineOf(n.children))]);
      into().push(section);
      stack.push({ depth: n.depth, tree: section });
      slugs.set(slug, section);
      continue;
    }
    into().push(...blockOrText(n));
  }
  return { title, blocks: root, slugs };
}

// ---- Frontmatter ----------------------------------------------------------------------------------

const FRONT_RE = /^﻿?---\r?\n([\s\S]*?\r?\n)---[ \t]*(?:\r?\n|$)/;
/** A file's frontmatter as JSON, and its body. */
export function frontOf(text: string): { data: JsonObject; body: string } {
  const m = FRONT_RE.exec(text);
  if (!m) return { data: {}, body: text };
  // CORE_SCHEMA keeps dates as written: JSON has no date type and the sources mean their literal text.
  return {
    data: asObject(json(load(m[1]!, { schema: CORE_SCHEMA }))),
    body: text.slice(m[0].length),
  };
}
const asText = (value: JsonValue) =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value)
          .map(([k, x]) => `${k}: ${String(x)}`)
          .join(', ')
      : String(value);
const DATE_RE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;
/** A value for a typed date field, or nothing when the source's value is not a date. */
const dateOr = (value: JsonValue | undefined, where: string): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (DATE_RE.test(String(value))) return String(value);
  report.invalidValues.push(`${where}: ${JSON.stringify(value)}`);
  return undefined;
};
const FACETS: Record<string, string> = { area: 'area', status: 'status', circle: 'circle' };
const KNOWN = new Set([
  'type',
  'aliases',
  'tags',
  'created',
  'summary',
  'relations',
  'dates',
  'decisions',
  'where',
  'open',
  'geo',
  'address',
  'follow-ups',
]);

export interface PageProjection {
  page: Data;
  /** Records from frontmatter, with natural keys. */
  records: Tree[];
  blocks: Tree[];
  slugs: Map<string, Tree>;
  /** Visible text of the source body, for the content check. */
  text: string;
}
/** The names a page is found by besides its path. */
export const aliasesOf = (page: Data): string[] =>
  Array.isArray(page.aliases) ? page.aliases.map(String) : [];

export function projectPage(path: string, source: string): PageProjection {
  const { data: fm, body } = frontOf(source);
  const mdx = path.endsWith('.mdx');
  const { title, blocks, slugs } = blocksOf(body, mdx);
  for (const k of Object.keys(fm)) if (!KNOWN.has(k)) tally(report.unknownFields, k);
  const aliases = list(fm.aliases);
  const created = dateOr(fm.created, `${path} created`);
  const page: Data = {
    kind: 'page',
    title: (
      title ??
      path
        .replace(/\.(mdx?)$/, '')
        .split('/')
        .at(-1)!
    ).slice(0, 200),
    ...(fm.summary ? { summary: String(fm.summary) } : {}),
    ...(aliases.length ? { aliases: aliases.map(asText) } : {}),
    ...(created ? { created } : {}),
    ...(fm.geo && typeof fm.geo === 'object' ? { geo: fm.geo } : {}),
    ...(fm.address ? { address: String(fm.address) } : {}),
  };
  const records: Tree[] = [];
  const seen = new Map<string, number>();
  const natural = (base: string) => {
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}#${n}`;
  };
  const relate = (predicate: string, target: Ref, label: string, base: string): Tree => ({
    ...node({ kind: 'relationship', predicate, label }, [], label, target),
    natural: natural(base),
  });
  if (fm.type !== undefined)
    records.push(relate('type', { term: `type:${String(fm.type)}` }, String(fm.type), 'type'));
  for (const tag of list(fm.tags).map(String)) {
    const slash = tag.indexOf('/');
    const scheme = slash > 0 ? FACETS[tag.slice(0, slash)] : undefined;
    records.push(
      relate(
        'tag',
        { term: scheme ? `${scheme}:${tag.slice(slash + 1)}` : `tag:${tag}` },
        tag,
        `tag/${tag}`,
      ),
    );
  }
  const relations = fm.relations && typeof fm.relations === 'object' ? fm.relations : {};
  for (const [predicate, names] of Object.entries(relations))
    for (const name of list(names).map(String))
      records.push(relate(predicate, { page: name }, name, `rel/${predicate}/${name}`));
  for (const name of list(fm.where).map(String))
    records.push(relate('where', { page: name }, name, `where/${name}`));
  for (const q of list(fm.open).map(String))
    records.push({ ...node({ kind: 'question', text: q }, [], q), natural: `question/${hash(q)}` });
  for (const value of list(fm.dates)) {
    const d = asObject(value);
    if (!dateOr(d.date, `${path} dates`)) continue;
    const date: Tree = {
      ...node(
        {
          kind: 'date',
          date: String(d.date),
          ...(dateOr(d.end, `${path} dates.end`) ? { end: String(d.end) } : {}),
          ...(d.repeat ? { repeat: d.repeat } : {}),
          ...(d.what ? { label: String(d.what) } : {}),
        },
        [],
        `${String(d.date)} ${String(d.what)}`,
      ),
      natural: natural(`date/${String(d.date)}`),
    };
    for (const name of list(d.where).map(String))
      date.children.push(relate('where', { page: name }, name, `${date.natural}/where/${name}`));
    records.push(date);
  }
  for (const value of list(fm.decisions)) {
    const d = asObject(value);
    if (!dateOr(d.date, `${path} decisions`)) continue;
    const decision: Tree = {
      ...node(
        {
          kind: 'decision',
          date: String(d.date),
          what: String(d.what),
          ...(d.why ? { why: String(d.why) } : {}),
        },
        [],
        String(d.what),
      ),
      natural: natural(`decision/${String(d.date)}`),
    };
    for (const name of list(d.who).map(String))
      decision.children.push(
        relate('who', { page: name }, name, `${decision.natural}/who/${name}`),
      );
    records.push(decision);
  }
  for (const value of list(fm['follow-ups'])) {
    const t = asObject(value);
    const what = String(t.what ?? value);
    const due = dateOr(t.by, `${path} follow-ups.by`);
    const task: Tree = {
      ...node({ kind: 'task', what, ...(due ? { due } : {}), status: 'open' }, [], what),
      natural: `task/${hash(what)}`,
    };
    for (const name of list(t.who).map(String))
      task.children.push(relate('who', { page: name }, name, `${task.natural}/who/${name}`));
    records.push(task);
  }
  const day = /^daily\/(\d{4}-\d{2}-\d{2})\.md$/.exec(path)?.[1];
  if (day) records.push({ ...node({ kind: 'date', date: day }, [], day), natural: 'day' });
  return { page, records, blocks, slugs, text: textOfBody(body, mdx) };
}

/** Visible text of a body, the way the content check compares it: every text value in order. */
function textOfBody(body: string, mdx: boolean): string {
  let first = true;
  const parts: string[] = [];
  for (const s of segments(body, mdx)) {
    if ('component' in s) continue;
    for (const n of markdown.parse(withoutComments(s.markdown, mdx)).children) {
      if (first && n.type === 'heading' && n.depth === 1) {
        first = false;
        continue;
      }
      first = false;
      // Wikilinks show their text; inside code they are literal.
      parts.push(
        n.type === 'code'
          ? n.value
          : textOf(n).replace(
              /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
              (_: string, name: string, label?: string) => (label ?? name).trim(),
            ),
      );
    }
  }
  return parts.join('').replace(/\s+/g, '');
}
const NO_TEXT = new Set(['chart', 'timeline', 'query', 'rule']);
/** The text a tree displays, compared with its source's. */
export const textOfTree = (trees: readonly Tree[]): string =>
  trees
    .map((t) =>
      t.data.kind === 'run' || t.data.kind === 'link' || t.data.kind === 'code'
        ? textField(t.data)
        : NO_TEXT.has(t.data.kind)
          ? ''
          : textOfTree(t.children),
    )
    .join('')
    .replace(/\s+/g, '');

// ---- Matching -------------------------------------------------------------------------------------

const bigrams = (s: string) => {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const pair = s.slice(i, i + 2);
    out.set(pair, (out.get(pair) ?? 0) + 1);
  }
  return out;
};
function similarity(a: string, b: string) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const x = bigrams(a);
  let both = 0;
  for (const [pair, n] of bigrams(b)) {
    const m = x.get(pair);
    if (m) both += Math.min(m, n);
  }
  return (2 * both) / (a.length + b.length - 2);
}
const flatten = (trees: readonly Tree[], out: Tree[] = []) => {
  for (const t of trees) {
    out.push(t);
    flatten(t.children, out);
  }
  return out;
};
/** Give a new revision's body nodes the identities of the previous revision's matching nodes:
 * identical text first, then the most similar text of the same kind. */
export function match(
  previous: readonly Tree[],
  next: readonly Tree[],
  fresh: (n: number) => string,
) {
  const old = flatten(previous).filter((t) => !t.natural);
  const neu = flatten(next).filter((t) => !t.natural);
  const used = new Set<Tree>();
  const byKind = new Map<string, Tree[]>();
  for (const t of old) byKind.set(t.data.kind, [...(byKind.get(t.data.kind) ?? []), t]);
  const sigs = new Map<Tree, string>();
  const sig = (t: Tree) => {
    let s = sigs.get(t);
    if (s === undefined) {
      s = sigOf(t);
      sigs.set(t, s);
    }
    return s;
  };
  for (const t of neu) {
    const exact = byKind.get(t.data.kind)?.find((o) => !used.has(o) && sig(o) === sig(t));
    if (exact) {
      used.add(exact);
      t.key = exact.key;
    }
  }
  let n = 0;
  for (const t of neu) {
    if (t.key) continue;
    let best: Tree | undefined;
    let score = 0.5;
    for (const o of byKind.get(t.data.kind) ?? []) {
      if (used.has(o)) continue;
      const s = similarity(sig(o), sig(t));
      if (s > score || (s === score && !best)) {
        best = o;
        score = s;
      }
    }
    if (best && (score > 0.5 || sig(t) === '')) {
      used.add(best);
      t.key = best.key;
    } else t.key = fresh(n++);
  }
}
