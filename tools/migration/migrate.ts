// Migration of the Markdown vault into Vaulter's node records (vaulter: docs/specs/vault-records.md).
//
// Replays the vault's first-parent history as `vault.import` transactions, each recorded by its
// original author at its original time with its original message. Every revision of a page becomes
// a tree of Wiki nodes; consecutive revisions are matched node by node so an edit versions only what
// it changed. Every version is validated with its owning schema; the result is accepted after the
// application's existing node history and revalidated exactly as the GitHub adapter loads it.
// Writes nothing into the vault or the app.
//
//   node migrate-nodes.ts --vault ~/vault --app ~/vaulter --out /tmp/vault-migration
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const option = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const VAULT = resolve(option('vault', '../vault'));
const OUT = resolve(option('out', join(tmpdir(), 'vault-migration')));
const VAULT_REF = option('vault-ref', 'origin/main');

import { parseCommit, parseRecord } from '../../app/vault/nodes/validation.ts';
import { accept, validateRecords, snapshotOf } from '../../app/vault/nodes/history.ts';
import { canonical, digest } from '../../app/vault/nodes/json.ts';
import { nodeInterface } from '../../app/vault/nodes/backend.ts';
import { defaultIdentities } from '../../app/application-identities.ts';
import { parseVaultRecord } from '../../app/vault/records/index.ts';
import { containment } from '../../app/vault/records/wiki.ts';
import * as chat from '../../app/workflows/chat/records/chat-schema.ts';
import {
  parseMetadata,
  parseMetadataReference,
} from '../../app/workflows/chat/records/chat-metadata-schema.ts';
import { savedChats, savedMessages } from '../../app/workflows/chat/records/chat-store.ts';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toString as textOf } from 'mdast-util-to-string';
import GithubSlugger from 'github-slugger';
import { CORE_SCHEMA, load } from 'js-yaml';
const markdown = unified().use(remarkParse).use(remarkGfm);

const OWNER: string = defaultIdentities.user;
const AGENT: string = defaultIdentities.agent;
const IMPORT = { scope: 'vault', action: 'import' } as const;
/** When the migration's own transactions were first recorded; a re-run keeps them, so it reproduces
 * the published history exactly. */
const RECORDED = {
  authors: '2026-10-11T05:55:23.150Z',
  outcomes: '2026-10-11T05:56:36.984Z',
} as const;
const TIMEZONE = 'Europe/Stockholm';

const report = {
  skippedCommits: [] as string[],
  unsupported: {} as Record<string, number>,
  unknownFields: {} as Record<string, number>,
  abandoned: [] as { question: string; page: string }[],
  tasks: [] as { task: string; page: string; status: string }[],
  merged: [] as { page: string; into: string }[],
  removedPages: [] as string[],
  weatherWithoutPlace: [] as string[],
  textMismatches: [] as string[],
  invalidValues: [] as string[],
  unresolvedAtHead: [] as unknown[],
};
const tally = (bucket: Record<string, number>, key: string) => {
  bucket[key] = (bucket[key] ?? 0) + 1;
};

// ---------------------------------------------------------------------------------------------------
// Git.

const git = (...args: string[]) =>
  execFileSync('git', ['-C', VAULT, ...args], { encoding: 'utf8', maxBuffer: 1 << 30 });
const HEAD = git('rev-parse', VAULT_REF).trim();
interface Person {
  name: string;
  email: string;
  at: string;
}
interface Commit {
  hash: string;
  parents: string[];
  author: Person;
  message: string;
}
const commits = new Map<string, Commit>();
for (const raw of git('log', '--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%B%x1e', HEAD).split(
  '\x1e',
)) {
  const f = raw.replace(/^\n/, '').split('\x00');
  if (f.length < 6) continue;
  commits.set(f[0]!, {
    hash: f[0]!,
    parents: f[1] ? f[1].split(' ') : [],
    author: { name: f[2]!, email: f[3]!, at: f[4]! },
    message: f[5]!.replace(/\n+$/, ''),
  });
}
const firstParent = git('rev-list', '--first-parent', '--reverse', HEAD).trim().split('\n');

const isPage = (path: string) =>
  /\.(md|mdx|yaml)$/.test(path) && !/^(site|\.github|\.vaulter)\//.test(path);
const treeAt = (commit: string) => {
  const files = new Map<string, string>();
  for (const entry of git('ls-tree', '-r', '-z', commit).split('\0')) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/s.exec(entry);
    if (m && isPage(m[2]!)) files.set(m[2]!, m[1]!);
  }
  return files;
};
const renamesAt = (commit: string, parent: string | undefined) => {
  const f = (
    parent
      ? git('diff-tree', '-r', '-M', '-z', '--name-status', parent, commit)
      : git('diff-tree', '-r', '--root', '-z', '--name-status', commit)
  ).split('\0');
  const renames: [string, string][] = [];
  for (let i = 0; i < f.length; ) {
    const status = f[i++];
    if (!status) continue;
    if (/^[RC]/.test(status)) {
      const from = f[i++]!;
      const to = f[i++]!;
      if (status.startsWith('R')) renames.push([from, to]);
    } else i++;
  }
  return renames;
};
const blobs = new Map<string, string>();
function readBlobs(shas: Iterable<string>) {
  const missing = [...new Set(shas)].filter((s) => !blobs.has(s));
  if (!missing.length) return;
  const out = spawnSync('git', ['-C', VAULT, 'cat-file', '--batch'], {
    input: `${missing.join('\n')}\n`,
    maxBuffer: 1 << 30,
  }).stdout;
  for (let at = 0; at < out.length; ) {
    const nl = out.indexOf(10, at);
    const [sha, , size] = out.subarray(at, nl).toString().split(' ');
    blobs.set(sha!, out.subarray(nl + 1, nl + 1 + Number(size)).toString('utf8'));
    at = nl + 2 + Number(size);
  }
}

// The application's own node history on the source branch, without any earlier migration.
const NODE_PREFIX = '.vaulter/nodes/v1/transactions/';
const existing = validateRecords(
  git('ls-tree', '-r', '-z', '--name-only', HEAD, '--', NODE_PREFIX)
    .split('\0')
    .filter(
      (p) => p && !/^(migration|vault):/.test(decodeURIComponent(p.slice(NODE_PREFIX.length))),
    ) // earlier migrations are replaced
    .map((p) => parseRecord(JSON.parse(git('show', `${HEAD}:${p}`))))
    .sort((a: any, b: any) => a.transaction.sequence - b.transaction.sequence),
);

// ---------------------------------------------------------------------------------------------------
// Identities, keys and order.

const uuid = (key: string) => {
  const h = createHash('sha256').update(`vault-migration/v2\n${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((Number.parseInt(h[16]!, 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const fixed: Record<string, string> = { owner: OWNER, agent: AGENT };
const identityMap: Record<string, string> = {};
const idOf = (key: string) => {
  identityMap[key] ??= fixed[key] ?? uuid(key);
  return identityMap[key];
};
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12);

/** Who a source commit's author is: the owner, the application's agent, or an agent of their own. */
const authors = {
  owner: 'owner',
  claude: 'agent:claude',
  librarian: 'agent:librarian',
  agent: 'agent',
} as const;
const authorOf = ({ name, email }: Person) =>
  name === 'Jim Lundin' || /JimLundin@users\.noreply\.github\.com$/i.test(email)
    ? authors.owner
    : name === 'Claude'
      ? authors.claude
      : name === 'Vaulter Librarian'
        ? authors.librarian
        : name === 'Vaulter'
          ? authors.agent
          : (() => {
              throw new Error(`Unmapped author ${name} <${email}>`);
            })();

// Fractional order keys: inserting between siblings never renumbers them.
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
function between(a: string | null, b: string | null): string {
  let out = '';
  for (let i = 0; ; i++) {
    const lo = a !== null && i < a.length ? DIGITS.indexOf(a[i]!) : 0;
    const hi = b !== null && i < b.length ? DIGITS.indexOf(b[i]!) : 36;
    if (hi - lo > 1) return out + DIGITS[Math.floor((lo + hi) / 2)]!;
    out += DIGITS[lo]!;
    if (lo < hi) b = null;
    if (a !== null && i >= a.length) a = null;
  }
}
/** Order keys for children, keeping the longest run of retained keys that is still in order. */
function orderKeys(
  previous: (string | undefined)[],
  floor: string,
  ceiling: string | null,
): string[] {
  const kept = new Set<number>();
  // Longest increasing subsequence of retained keys.
  const tails: number[] = [];
  const back: number[] = [];
  previous.forEach((key, i) => {
    if (key === undefined || key <= floor || (ceiling !== null && key >= ceiling)) return;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (previous[tails[mid]!]! < key) lo = mid + 1;
      else hi = mid;
    }
    back[i] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = i;
  });
  for (let i = tails.at(-1) ?? -1; i >= 0; i = back[i]!) kept.add(i);
  const out: string[] = [];
  for (let i = 0; i < previous.length; i++) {
    if (kept.has(i)) {
      out.push(previous[i]!);
      continue;
    }
    let next: string | null = ceiling;
    for (let j = i + 1; j < previous.length; j++)
      if (kept.has(j)) {
        next = previous[j]!;
        break;
      }
    out.push(between(out.at(-1) ?? floor, next));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Pages as trees.

type Ref =
  | { page: string } // a page name or alias
  | { path: string; anchor?: string } // an internal link
  | { resource: string }
  | { term: string }
  | { node: string };
interface Tree {
  data: Record<string, any>;
  children: Tree[];
  target?: Ref;
  /** What identifies it among revisions: its text, for matching. */
  sig: string;
  /** Records from frontmatter carry a natural key instead of being matched. */
  natural?: string;
  key?: string;
}
const node = (data: Record<string, any>, children: Tree[] = [], sig = '', target?: Ref): Tree => ({
  data,
  children,
  sig,
  ...(target ? { target } : {}),
});
const sigOf = (t: Tree): string => t.sig || t.children.map(sigOf).join(' ');

type Mark = 'strong' | 'emphasis' | 'code' | 'strike';
const WIKI_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
function linkTarget(url: string): Ref {
  if (/^(https?|mailto|tel):/i.test(url)) return { resource: url };
  let decoded = url;
  try {
    decoded = decodeURI(url);
  } catch {}
  const [path, anchor] = decoded.replace(/^\//, '').split('#'); // '#anchor' alone: this page
  return { path: path!, ...(anchor ? { anchor } : {}) };
}
function inlineOf(nodes: any[], marks: Mark[] = []): Tree[] {
  return inlineRuns(nodes, marks).flatMap((t) => {
    if (t.data.kind !== 'run' || !t.data.text.includes('[[')) return [t];
    const out: Tree[] = [];
    const m = t.data.marks as Mark[] | undefined;
    let at = 0;
    for (const w of t.data.text.matchAll(WIKI_RE)) {
      const before = t.data.text.slice(at, w.index);
      if (before)
        out.push(node({ kind: 'run', text: before, ...(m ? { marks: m } : {}) }, [], before));
      const text = (w[3] ?? w[1]).trim();
      const target: Ref = w[1].startsWith('captures/')
        ? { path: w[1].trim(), ...(w[2] ? { anchor: w[2] } : {}) }
        : w[2]
          ? { path: `${w[1].trim()}.md`, anchor: w[2] }
          : { page: w[1].trim() };
      out.push(
        node({ kind: 'link', text, ...(m ? { marks: m } : {}) }, [], `${text} ${w[0]}`, target),
      );
      at = w.index! + w[0].length;
    }
    const after = t.data.text.slice(at);
    if (after) out.push(node({ kind: 'run', text: after, ...(m ? { marks: m } : {}) }, [], after));
    return out;
  });
}
function inlineRuns(nodes: any[], marks: Mark[] = []): Tree[] {
  const out: Tree[] = [];
  const run = (text: string, m: Mark[]) => {
    if (!text) return;
    const last = out.at(-1);
    const key = m.join();
    if (last?.data.kind === 'run' && (last.data.marks ?? []).join() === key) {
      last.data.text += text;
      last.sig = last.data.text;
    } else out.push(node({ kind: 'run', text, ...(m.length ? { marks: [...m] } : {}) }, [], text));
  };
  const with_ = (m: Mark) => (marks.includes(m) ? marks : [...marks, m]);
  for (const n of nodes) {
    if (n.type === 'text') run(n.value, marks);
    else if (n.type === 'strong')
      out.push(...mergeInto(out, inlineRuns(n.children, with_('strong'))));
    else if (n.type === 'emphasis')
      out.push(...mergeInto(out, inlineRuns(n.children, with_('emphasis'))));
    else if (n.type === 'delete')
      out.push(...mergeInto(out, inlineRuns(n.children, with_('strike'))));
    else if (n.type === 'inlineCode') run(n.value, with_('code'));
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
      run(textOf(n) || n.value || '', marks);
    }
  }
  return out;
}
// Adjacent runs with equal marks merge across nested formatting.
function mergeInto(out: Tree[], next: Tree[]): Tree[] {
  const first = next[0];
  const last = out.at(-1);
  if (
    first &&
    last &&
    first.data.kind === 'run' &&
    last.data.kind === 'run' &&
    (first.data.marks ?? []).join() === (last.data.marks ?? []).join()
  ) {
    last.data.text += first.data.text;
    last.sig = last.data.text;
    return next.slice(1);
  }
  return next;
}
const textContainer = (kind: string, inline: Tree[]) => node({ kind }, inline);

/** A Markdown block other than a heading, as Wiki nodes; null when it has no Wiki kind. */
function blockOf(n: any): Tree | null {
  if (n.type === 'component') return n.tree;
  if (n.type === 'paragraph') return textContainer('paragraph', inlineOf(n.children));
  if (n.type === 'list') return listOf(n);
  if (n.type === 'blockquote')
    return node(
      { kind: 'quote' },
      n.children.flatMap((c: any) => blockOrText(c)),
    );
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
      n.children.map((row: any) =>
        node(
          { kind: 'row' },
          row.children.map((cell: any, i: number) =>
            node(
              { kind: 'cell', ...(n.align?.[i] ? { align: n.align[i] } : {}) },
              inlineOf(cell.children),
            ),
          ),
        ),
      ),
    );
  return null;
}
/** A block, or its text as a paragraph when it has no Wiki kind (reported). */
function blockOrText(n: any): Tree[] {
  const block =
    n.type === 'heading' ? textContainer('paragraph', inlineOf(n.children)) : blockOf(n);
  if (n.type === 'heading') tally(report.unsupported, 'block:heading-inside-block');
  if (block) return [block];
  tally(report.unsupported, `block:${n.type}`);
  const text = textOf(n) || n.value || '';
  return text ? [textContainer('paragraph', [node({ kind: 'run', text }, [], text)])] : [];
}
/** An item holds its first paragraph's inline nodes, then the rest of its blocks in order. */
function listOf(list: any): Tree {
  return node(
    { kind: 'list', ordered: !!list.ordered },
    list.children.map((item: any) => {
      if (item.checked !== null && item.checked !== undefined)
        tally(report.unsupported, 'block:task-list-item');
      const [first, ...rest] = item.children;
      const inline = first?.type === 'paragraph' ? inlineOf(first.children) : [];
      const blocks = (first?.type === 'paragraph' ? rest : item.children).flatMap((c: any) =>
        blockOrText(c),
      );
      return node({ kind: 'item' }, [...inline, ...blocks]);
    }),
  );
}

// MDX props are literal values only (conventions §13): parse them without evaluating anything.
function literal(src: string): unknown {
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };
  const str = () => {
    const q = src[i++]!;
    let s = '';
    while (src[i] !== q) {
      if (i >= src.length) throw new Error('unterminated string');
      s +=
        src[i] === '\\'
          ? (({ n: '\n', t: '\t' } as Record<string, string>)[src[++i]!] ?? src[i])
          : src[i];
      i++;
    }
    i++;
    return s;
  };
  const value = (): unknown => {
    ws();
    const c = src[i];
    if (c === '"' || c === "'") return str();
    if (c === '[' || c === '{') {
      const close = c === '[' ? ']' : '}';
      i++;
      const arr: unknown[] = [];
      const obj: Record<string, unknown> = {};
      for (ws(); src[i] !== close; ws()) {
        if (i >= src.length) throw new Error(`unterminated ${c}`);
        if (c === '[') arr.push(value());
        else {
          let key: string;
          if (src[i] === '"' || src[i] === "'") key = str();
          else {
            key = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))![0];
            i += key.length;
          }
          ws();
          if (src[i++] !== ':') throw new Error('expected :');
          obj[key] = value();
        }
        ws();
        if (src[i] === ',') i++;
      }
      i++;
      return c === '[' ? arr : obj;
    }
    const m = /^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null)/.exec(src.slice(i));
    if (!m) throw new Error(`unexpected ${src.slice(i, i + 10)}`);
    i += m[0].length;
    return JSON.parse(m[0]);
  };
  const v = value();
  ws();
  if (i !== src.length) throw new Error('trailing input');
  return v;
}
function propsOf(tag: string): Record<string, any> {
  const out: Record<string, any> = {};
  const end = tag.lastIndexOf('/>');
  let i = /^\s*<[A-Z]\w*/.exec(tag)![0].length;
  while (i < end) {
    const m = /^\s*([A-Za-z][\w-]*)(=?)/.exec(tag.slice(i, end));
    if (!m) break;
    i += m[0].length;
    if (!m[2]) out[m[1]!] = true;
    else if (tag[i] === '"' || tag[i] === "'") {
      const close = tag.indexOf(tag[i]!, i + 1);
      out[m[1]!] = tag.slice(i + 1, close);
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
        else if (c === '}' && --depth === 0) break;
      }
      out[m[1]!] = literal(tag.slice(i + 1, j).trim());
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
        chart: p.kind,
        title: p.title,
        ...(p.unit ? { unit: p.unit } : {}),
        x: p.x,
        series: p.series,
      },
      [],
      `${p.title}`,
    );
  if (name === 'Timeline')
    return node(
      { kind: 'timeline' },
      (p.items as any[]).map((item) => {
        const date = node(
          { kind: 'date', date: item.date, label: item.text },
          [],
          `${item.date} ${item.text}`,
        );
        if (item.href)
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

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
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
    if (f) fence = fence === null ? f[1]![0]! : fence === f[1]![0] ? null : fence;
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

/** A body's blocks, with sections nested by heading depth; the first H1 is the page's title. */
function blocksOf(
  body: string,
  mdx: boolean,
): { title: string | null; blocks: Tree[]; slugs: Map<string, Tree> } {
  const flat: any[] = [];
  for (const s of segments(body, mdx))
    if ('component' in s) flat.push({ type: 'component', tree: componentOf(s.component) });
    else
      flat.push(
        ...markdown.parse(mdx ? s.markdown.replace(/\{\/\*[\s\S]*?\*\/\}/g, '') : s.markdown)
          .children,
      );
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
function frontOf(text: string) {
  const m = FRONT_RE.exec(text);
  if (!m) return { data: {} as Record<string, any>, body: text };
  const parsed = load(m[1], { schema: CORE_SCHEMA });
  return {
    data: (parsed && typeof parsed === 'object'
      ? JSON.parse(JSON.stringify(parsed))
      : {}) as Record<string, any>,
    body: text.slice(m[0].length),
  };
}
const list = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
const asText = (v: unknown) =>
  typeof v === 'string'
    ? v
    : v && typeof v === 'object'
      ? Object.entries(v)
          .map(([k, x]) => `${k}: ${x}`)
          .join(', ')
      : String(v);
const DATE_RE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;
/** A value for a typed date field, or nothing when the source's value is not a date. */
const dateOr = (v: unknown, where: string): string | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  if (DATE_RE.test(String(v))) return String(v);
  report.invalidValues.push(`${where}: ${JSON.stringify(v)}`);
  return undefined;
};
const facetScheme: Record<string, string> = { area: 'area', status: 'status', circle: 'circle' };
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

interface PageProjection {
  page: Record<string, any>;
  /** Records from frontmatter, with natural keys. */
  records: Tree[];
  blocks: Tree[];
  slugs: Map<string, Tree>;
  /** Plain text of the source body, for the content check. */
  text: string;
}
function projectPage(path: string, source: string): PageProjection {
  const { data: fm, body } = frontOf(source);
  const { title, blocks, slugs } = blocksOf(body, path.endsWith('.mdx'));
  for (const k of Object.keys(fm)) if (!KNOWN.has(k)) tally(report.unknownFields, `${k}`);
  const page = {
    kind: 'page',
    title: (
      title ??
      path
        .replace(/\.(mdx?)$/, '')
        .split('/')
        .at(-1)!
    ).slice(0, 200),
    ...(fm.summary ? { summary: String(fm.summary) } : {}),
    ...(list(fm.aliases).length ? { aliases: list(fm.aliases).map(asText) } : {}),
    ...(dateOr(fm.created, `${path} created`) ? { created: dateOr(fm.created, '') } : {}),
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
    records.push(relate('type', { term: `type:${fm.type}` }, String(fm.type), 'type'));
  for (const tag of list(fm.tags).map(String)) {
    const slash = tag.indexOf('/');
    const scheme = slash > 0 ? facetScheme[tag.slice(0, slash)] : undefined;
    records.push(
      relate(
        'tag',
        { term: scheme ? `${scheme}:${tag.slice(slash + 1)}` : `tag:${tag}` },
        tag,
        `tag/${tag}`,
      ),
    );
  }
  for (const [predicate, names] of Object.entries(
    fm.relations && typeof fm.relations === 'object' ? fm.relations : {},
  ))
    for (const name of list(names).map(String))
      records.push(relate(predicate, { page: name }, name, `rel/${predicate}/${name}`));
  for (const name of list(fm.where).map(String))
    records.push(relate('where', { page: name }, name, `where/${name}`));
  for (const q of list(fm.open).map(String))
    records.push({ ...node({ kind: 'question', text: q }, [], q), natural: `question/${hash(q)}` });
  for (const d of list(fm.dates) as any[]) {
    if (!dateOr(d?.date, `${path} dates`)) continue;
    const date = {
      ...node(
        {
          kind: 'date',
          date: String(d.date),
          ...(dateOr(d.end, `${path} dates.end`) ? { end: String(d.end) } : {}),
          ...(d.repeat ? { repeat: d.repeat } : {}),
          ...(d.what ? { label: String(d.what) } : {}),
        },
        [],
        `${d.date} ${d.what}`,
      ),
      natural: natural(`date/${d.date}`),
    };
    for (const name of list(d.where).map(String))
      date.children.push(relate('where', { page: name }, name, `${date.natural}/where/${name}`));
    records.push(date);
  }
  for (const d of list(fm.decisions) as any[]) {
    if (!dateOr(d?.date, `${path} decisions`)) continue;
    const decision = {
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
      natural: natural(`decision/${d.date}`),
    };
    for (const name of list(d.who).map(String))
      decision.children.push(
        relate('who', { page: name }, name, `${decision.natural}/who/${name}`),
      );
    records.push(decision);
  }
  for (const t of list(fm['follow-ups']) as any[]) {
    const what = String(t?.what ?? t);
    const task = {
      ...node(
        {
          kind: 'task',
          what,
          ...(dateOr(t?.by, `${path} follow-ups.by`) ? { due: String(t.by) } : {}),
          status: 'open',
        },
        [],
        what,
      ),
      natural: `task/${hash(what)}`,
    };
    for (const name of list(t?.who).map(String))
      task.children.push(relate('who', { page: name }, name, `${task.natural}/who/${name}`));
    records.push(task);
  }
  const day = /^daily\/(\d{4}-\d{2}-\d{2})\.md$/.exec(path)?.[1];
  if (day) records.push({ ...node({ kind: 'date', date: day }, [], day), natural: 'day' });
  const plain = textOfBody(body, path.endsWith('.mdx'));
  return { page, records, blocks, slugs, text: plain };
}
/** Visible text of a body, the way the content check compares it: every text value in order. */
function textOfBody(body: string, mdx: boolean): string {
  let first = true;
  const parts: string[] = [];
  for (const s of segments(body, mdx)) {
    if ('component' in s) continue;
    for (const n of markdown.parse(
      mdx ? s.markdown.replace(/\{\/\*[\s\S]*?\*\/\}/g, '') : s.markdown,
    ).children) {
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
              (_: string, a: string, b?: string) => (b ?? a).trim(),
            ),
      );
    }
  }
  return parts.join('').replace(/\s+/g, '');
}
const textOfTree = (trees: Tree[]): string =>
  trees
    .map((t) =>
      t.data.kind === 'run' || t.data.kind === 'link'
        ? t.data.text
        : t.data.kind === 'code'
          ? t.data.text
          : ['chart', 'timeline', 'query', 'rule'].includes(t.data.kind)
            ? ''
            : textOfTree(t.children),
    )
    .join('')
    .replace(/\s+/g, '');

// ---- Matching -------------------------------------------------------------------------------------

const bigrams = (s: string) => {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++)
    out.set(s.slice(i, i + 2), (out.get(s.slice(i, i + 2)) ?? 0) + 1);
  return out;
};
function similarity(a: string, b: string) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const x = bigrams(a);
  let both = 0;
  for (const [g, n] of bigrams(b)) {
    const m = x.get(g);
    if (m) both += Math.min(m, n);
  }
  return (2 * both) / (a.length + b.length - 2);
}
const flatten = (trees: Tree[], out: Tree[] = []) => {
  for (const t of trees) {
    out.push(t);
    flatten(t.children, out);
  }
  return out;
};
/** Give a new revision's body nodes the identities of the previous revision's matching nodes. */
function match(previous: Tree[], next: Tree[], fresh: (n: number) => string) {
  const old = flatten(previous).filter((t) => !t.natural);
  const neu = flatten(next).filter((t) => !t.natural);
  const used = new Set<Tree>();
  const byKind = new Map<string, Tree[]>();
  for (const t of old) byKind.set(t.data.kind, [...(byKind.get(t.data.kind) ?? []), t]);
  const sigs = new Map<Tree, string>();
  const sig = (t: Tree) => sigs.get(t) ?? (sigs.set(t, sigOf(t)), sigs.get(t)!);
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

// ---------------------------------------------------------------------------------------------------
// Captures as the conversation.

const HEADING_RE = /^## (\d{2}:\d{2}(?::\d{2})?)\s*$/;
const MARKERS: RegExp[] = [
  /^\*\*(Jim|Agent):\*\* ?/,
  /^\*\*(Jim|Agent) \(([^)]*)\):\*\* ?/,
  /^\*\*(Jim|Agent)\*\* \(([^)]*)\): ?/,
];
const STAMP_RE = /^(?:(\d{4}-\d{2}-\d{2}) )?(\d{2}:\d{2})(?:[–-]\d{2}:\d{2})?(?:, .*)?$/;
function* lines(body: string) {
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const f = FENCE_RE.exec(line);
    const inside = fence !== null || !!f;
    if (f) fence = fence === null ? f[1]![0]! : fence === f[1]![0] ? null : fence;
    yield { line, code: inside };
  }
}
function turnsOf(text: string) {
  const turns: {
    role: 'user' | 'agent';
    stamp: { date: string | null; time: string } | null;
    text: string;
  }[] = [];
  const preamble: string[] = [];
  for (const { line, code } of lines(text)) {
    const m = code ? null : MARKERS.map((re) => re.exec(line)).find(Boolean);
    if (m) {
      const s = m[2] ? STAMP_RE.exec(m[2]) : null;
      turns.push({
        role: m[1] === 'Jim' ? 'user' : 'agent',
        stamp: s ? { date: s[1] ?? null, time: s[2]! } : null,
        text: line.slice(m[0].length),
      });
    } else if (turns.length) turns.at(-1)!.text += `\n${line}`;
    else preamble.push(line);
  }
  for (const t of turns) t.text = t.text.replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
  return { turns, preamble: preamble.join('\n').trim() || null };
}
function stockholm(date: string, time: string) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, timeZoneName: 'longOffset' })
    .formatToParts(new Date(Date.parse(`${date}T${time}:00Z`) - 3600e3))
    .find((p) => p.type === 'timeZoneName')!.value;
  return `${date}T${time}:00${name.replace('GMT', '') || '+00:00'}`;
}
const offsetMinutes = (at: string) => {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(at);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
};

// Old per-topic capture files were consolidated into day logs; each consolidated entry names its file.
const consolidated = new Map<string, { anchor: string; entry: Record<string, any> }>();
{
  const head = treeAt(HEAD);
  const paths = [...head.keys()].filter((p) => /^captures\/\d{4}-\d{2}-\d{2}\.md$/.test(p));
  readBlobs(paths.map((p) => head.get(p)!));
  for (const p of paths) {
    const { data, body } = frontOf(blobs.get(head.get(p)!)!);
    const headings = [...body.matchAll(/^## (\d{2}:\d{2}(?::\d{2})?)\s*$/gm)].map((m) => m[1]!);
    (data.exchanges ?? []).forEach((e: Record<string, any>, i: number) => {
      if (e.migrated?.from && headings[i])
        consolidated.set(e.migrated.from, {
          anchor: `${p}#${headings[i]!.replace(/:/g, '')}`,
          entry: e,
        });
    });
  }
}

interface Spec {
  data: Record<string, any>;
  parent: string | null;
  order: string;
  target?: Ref;
  /** An exact reference, fixed when first recorded. */
  exact?: {
    source: [key: string, transaction: string];
    target: [key: string, transaction: string];
  };
}
type Specs = Map<string, Spec>;

/** One capture file's exchanges and everything under them. */
/** Which conversation an exchange belongs to: its recorded session, the capture file it was one
 * conversation of, or itself. */
const conversationOf = (entry: Record<string, any>, anchor: string, topicFile: string | null) =>
  entry.session?.claude_session
    ? `conversation:session:${entry.session.claude_session}`
    : topicFile
      ? `conversation:file:${topicFile}`
      : `conversation:exchange:${anchor}`;
/** A conversation's title: an imported transcript's own heading, else the lead of its summary. */
function titleOf(preamble: string | null, summary: unknown, day: string) {
  const heading = preamble ? /^#\s+(.+)$/m.exec(preamble)?.[1]?.trim() : undefined;
  if (heading) return heading.slice(0, 200);
  const text = typeof summary === 'string' ? summary.trim() : '';
  const lead = /^([^:;.]{3,60})[:;.]/.exec(text)?.[1];
  if (lead) return `${lead} — ${day}`;
  if (text) return text.length > 80 ? `${text.slice(0, 80).replace(/\s+\S*$/, '')}…` : text;
  return `Conversation — ${day}`;
}
function projectCapture(
  path: string,
  text: string,
): {
  specs: Specs;
  texts: Map<string, string>;
  titles: Map<string, { startedAt: string; title: string }>;
} {
  const specs: Specs = new Map();
  const titles = new Map<string, { startedAt: string; title: string }>();
  const texts = new Map<string, string>(); // exchange key → its turns' text, for matching answers
  const { data, body } = frontOf(text);
  const day = /(\d{4}-\d{2}-\d{2})/.exec(path)![1]!;
  let sections: {
    heading: string | null;
    text: string;
    entry: Record<string, any>;
    anchor: string;
    precision: string;
    topicFile: string | null;
  }[];
  if (Array.isArray(data.exchanges)) {
    const parts: { heading: string; lines: string[] }[] = [];
    for (const { line, code } of lines(body)) {
      const h = code ? null : HEADING_RE.exec(line);
      if (h) parts.push({ heading: h[1]!, lines: [] });
      else parts.at(-1)?.lines.push(line);
    }
    sections = parts.map((part, i) => {
      const entry = data.exchanges[i] ?? {};
      return {
        heading: part.heading,
        text: part.lines.join('\n'),
        entry,
        anchor: `${path}#${part.heading.replace(/:/g, '')}`,
        precision: entry.migrated ? 'approximate' : 'second',
        topicFile: entry.migrated?.from ?? null,
      };
    });
  } else {
    const later = consolidated.get(path);
    sections = [
      {
        heading: null,
        text: body,
        entry: { ...data, at: later?.entry.at ?? stockholm(day, '00:00') },
        anchor: later?.anchor ?? path,
        precision: later ? 'approximate' : 'day',
        topicFile: path,
      },
    ];
  }
  for (const s of sections) {
    const ex = `exchange:${s.anchor}`;
    const startedAt = String(s.entry.at);
    const {
      at: _a,
      ended,
      procedure,
      summary,
      topics,
      where,
      source,
      migrated: _m,
      type: _t,
      date: _d,
      title: _ti,
      ...collected
    } = s.entry;
    const { turns, preamble } = turnsOf(s.text);
    const conversation = conversationOf(s.entry, s.anchor, s.topicFile);
    const candidate = { startedAt, title: titleOf(preamble, summary, day) };
    const known = titles.get(conversation);
    if (!known || Date.parse(startedAt) < Date.parse(known.startedAt))
      titles.set(conversation, candidate);
    specs.set(ex, {
      parent: conversation,
      order: `e${new Date(startedAt).toISOString().replace(/[-:.]/g, '')}${hash(s.anchor)}`,
      data: {
        kind: 'exchange',
        startedAt,
        startedAtPrecision: s.precision,
        ...(ended ? { endedAt: String(ended) } : {}),
        time: { timezone: TIMEZONE, offsetMinutes: offsetMinutes(startedAt) },
        ...(summary ? { summary: String(summary) } : {}),
        ...(preamble ? { preamble } : {}),
      },
    });
    let current = {
      at: startedAt,
      date: day,
      precision: s.precision === 'second' ? 'approximate' : s.precision,
    };
    turns.forEach((turn, n) => {
      if (turn.stamp) {
        const date = turn.stamp.date ?? current.date;
        current = { at: stockholm(date, turn.stamp.time), date, precision: 'minute' };
      }
      const precision = turn.stamp
        ? 'minute'
        : current.precision === 'minute'
          ? 'approximate'
          : current.precision;
      const data =
        turn.role === 'user'
          ? {
              kind: 'message',
              role: 'user',
              at: current.at,
              atPrecision: precision,
              text: turn.text,
              input: { methods: ['imported'] },
            }
          : {
              kind: 'message',
              role: 'agent',
              at: current.at,
              atPrecision: precision,
              status: 'complete',
              parts: [{ kind: 'text', text: turn.text }],
            };
      specs.set(`${ex}#${n + 1}`, {
        parent: ex,
        order: `m${String(n + 1).padStart(4, '0')}`,
        data,
      });
    });
    texts.set(ex, turns.map((t) => t.text).join('\n'));
    [
      ...list(topics).map((t): [string, unknown] => ['topic', t]),
      ...list(where).map((w): [string, unknown] => ['place', w]),
    ].forEach(([role, name], n) => {
      specs.set(`${ex}/${role}/${n}`, {
        parent: ex,
        order: `r${role[0]}${String(n).padStart(4, '0')}`,
        data: { kind: 'reference', role, label: String(name) },
        target: { page: String(name) },
      });
    });
    if (source)
      specs.set(`${ex}/source`, {
        parent: ex,
        order: 's1',
        data: { kind: 'relationship', predicate: 'source', label: String(source) },
        target: { term: `source:${source}` },
      });
    if (procedure)
      specs.set(`${ex}/procedure`, {
        parent: ex,
        order: 's2',
        data: { kind: 'relationship', predicate: 'procedure', label: String(procedure) },
        target: { term: `procedure:${procedure}` },
      });
    const observed = startedAt;
    const observation = (
      subject: string,
      value: Record<string, any>,
      quality?: Record<string, any>,
    ) => ({
      kind: 'observation',
      subject,
      source: { kind: 'application', name: 'vault capture' },
      time: { requested: null, observed, received: null, elapsedMs: null },
      outcome: { status: 'collected', value, ...(quality ? { quality } : {}) },
    });
    for (const [group, raw] of Object.entries(collected)) {
      const v = raw as Record<string, any>;
      const key = `${ex}/observation/${group}`;
      if (group === 'host')
        specs.set(key, {
          parent: ex,
          order: `o${group}`,
          data: observation('host', {
            ...pick(v, ['host', 'os', 'kernel', 'arch', 'user', 'shell', 'node']),
            ...(v.tz ? { timezone: v.tz } : {}),
          }),
        });
      else if (group === 'session')
        specs.set(key, {
          parent: ex,
          order: `o${group}`,
          data: observation('session', {
            ...(v.claude_session ? { session: v.claude_session } : {}),
            ...pick(v, ['entrypoint', 'effort', 'turns']),
          }),
        });
      else if (group === 'weather')
        specs.set(key, { parent: ex, order: `o${group}`, data: { pendingWeather: v } });
      else if (group === 'status' && raw === 'curated')
        tally(report.unknownFields, 'capture.status=curated (every capture is curated)');
      else tally(report.unknownFields, `capture.${group}`);
    }
  }
  return { specs, texts, titles };
}
const pick = (v: Record<string, any>, keys: string[]) =>
  Object.fromEntries(
    keys.filter((k) => v[k] !== undefined && v[k] !== null && v[k] !== '').map((k) => [k, v[k]]),
  );

// ---------------------------------------------------------------------------------------------------
// Vocabulary.

const SCHEMES: Record<string, string> = {
  components: 'component',
  types: 'type',
  areas: 'area',
  statuses: 'status',
  circles: 'circle',
  broad: 'topic',
  predicates: 'predicate',
  sources: 'source',
  procedures: 'procedure',
};
function projectSchema(text: string): Specs {
  const specs: Specs = new Map();
  const data = load(text, { schema: CORE_SCHEMA }) as Record<string, any>;
  // A section's leading comment says what the scheme is for.
  const comments = new Map<string, string>();
  let pending: string[] = [];
  for (const line of text.split('\n')) {
    if (/^#/.test(line)) pending.push(line.replace(/^#\s?/, ''));
    else if (/^[a-z-]+:/.test(line)) {
      comments.set(line.split(':')[0]!, pending.join(' ').trim());
      pending = [];
    } else if (!line.trim()) pending = pending.length ? pending : [];
  }
  if (typeof data.owner === 'string')
    specs.set('owner/is', {
      parent: 'owner',
      order: 'a',
      data: { kind: 'relationship', predicate: 'is', label: data.owner },
      target: { page: data.owner },
    });
  let n = 0;
  for (const [section, value] of Object.entries(data)) {
    if (section === 'owner') continue;
    const scheme = SCHEMES[section];
    if (!(scheme && value) || typeof value !== 'object') {
      tally(report.unknownFields, `schema.${section}`);
      continue;
    }
    const schemeKey = `term:scheme:${scheme}`;
    specs.set(schemeKey, {
      parent: null,
      order: 'a',
      data: {
        kind: 'term',
        scheme: 'scheme',
        key: scheme,
        ...(comments.get(section) ? { use: comments.get(section) } : {}),
      },
    });
    const entries: [string, Record<string, any>, string?][] = Array.isArray(value)
      ? value.map((name): [string, Record<string, any>] => [String(name), {}])
      : scheme === 'topic'
        ? Object.entries(value).flatMap(([group, topics]) =>
            list(topics).map((t): [string, Record<string, any>, string] => [String(t), {}, group]),
          )
        : Object.entries(value).map(([k, v]) => [k, (v ?? {}) as Record<string, any>]);
    for (const [key, fields, group] of entries) {
      const termKey = `term:${scheme}:${key}`;
      const { label, use, inverse, symmetric, hub, ...rest } = fields;
      for (const k of Object.keys(rest)) tally(report.unknownFields, `schema.${section}.${k}`);
      specs.set(termKey, {
        parent: schemeKey,
        order: `t${String(++n).padStart(4, '0')}`,
        data: {
          kind: 'term',
          scheme,
          key,
          ...(label ? { label: String(label) } : {}),
          ...(use ? { use: String(use) } : {}),
          ...(inverse ? { inverse: String(inverse) } : {}),
          ...(symmetric !== undefined ? { symmetric: !!symmetric } : {}),
        },
      });
      if (hub)
        specs.set(`${termKey}/hub`, {
          parent: termKey,
          order: 'a',
          data: { kind: 'relationship', predicate: 'hub', label: String(hub) },
          target: { page: String(hub) },
        });
      if (group)
        specs.set(`${termKey}/area`, {
          parent: termKey,
          order: 'a',
          data: { kind: 'relationship', predicate: 'area', label: group },
          target: { term: `area:${group}` },
        });
    }
  }
  return specs;
}

// ---------------------------------------------------------------------------------------------------
// Replay.

interface PageState {
  key: string; // page identity key
  path: string;
  sha: string;
  projection: PageProjection;
  /** Retired lifecycle records, kept under the page with their final state. */
  retired: Map<string, Tree>;
}
const pages = new Map<string, PageState>(); // path → state
const previousRecords = new Map<string, Map<string, Tree>>(); // page key → its last frontmatter records
const orders = new Map<string, string>(); // node → its order key, kept across revisions
const slugIndex = new Map<string, Map<string, string>>(); // page key → heading slug → section key
let atHead = false;
const pageLog: [commit: string, path: string, node: string][] = [];
const shown = new Set<string>();
/** Nodes under removed pages keep their last versions; a merged page also keeps itself and its link. */
const keepAlive = new Set<string>();
const kept: Specs = new Map();
const frozenExact = new Map<string, Spec>(); // exact references, fixed when first recorded
const captureCache = new Map<string, ReturnType<typeof projectCapture>>();
const schemaCache = new Map<string, Specs>();

interface State {
  json: string;
  transaction: string;
  alive: boolean;
  placement: unknown;
  connection: unknown;
  data: unknown;
}
const state = new Map<string, State>();
const existingNodes = new Set<string>();
for (const r of existing) for (const v of r.versions) existingNodes.add(v.key.node);
for (const r of existing)
  for (const v of r.versions)
    state.set(v.key.node, {
      json:
        v.data === null
          ? ''
          : `${canonical(v.data)}|${v.placement ? `${v.placement.parent} ${v.placement.order}` : ''}|${v.connection ? JSON.stringify(v.connection) : ''}`,
      transaction: r.transaction.id,
      alive: v.data !== null,
      placement: v.placement,
      connection: v.connection,
      data: v.data,
    });

const requests: Record<string, any>[] = [];
const txId = (key: string) => `vault:${uuid(`transaction:${key}`)}`;
{
  const agents = [
    [authors.claude, 'Claude'],
    [authors.librarian, 'Vaulter Librarian'],
  ] as const;
  const id = txId('identities');
  const changes = agents.map(([key, name]) => ({
    node: idOf(key),
    expected: null,
    placement: null,
    connection: null,
    data: { kind: 'agent', name },
  }));
  requests.push({
    request: {
      id,
      recordedBy: OWNER,
      origin: null,
      kind: { scope: 'node', action: 'create' },
      message: 'Establish the vault’s historical authors',
      undoOf: null,
      changes,
    },
    recordedAt: RECORDED.authors,
    commit: null,
  });
  for (const ch of changes)
    state.set(ch.node, {
      json: `${canonical(ch.data)}||`,
      transaction: id,
      alive: true,
      placement: null,
      connection: null,
      data: ch.data,
    });
}
const identitySpecs: Specs = new Map([
  ['owner', { parent: null, order: 'a', data: { kind: 'actor', name: 'Vault owner' } }],
  ['agent', { parent: null, order: 'a', data: { kind: 'agent', name: 'Vault agent' } }],
  [authors.claude, { parent: null, order: 'a', data: { kind: 'agent', name: 'Claude' } }],
  [
    authors.librarian,
    { parent: null, order: 'a', data: { kind: 'agent', name: 'Vaulter Librarian' } },
  ],
]);

const dataJson = new WeakMap<object, string>();
const jsonOf = (data: Record<string, any>) => {
  let j = dataJson.get(data);
  if (j === undefined) {
    j = canonical(data);
    dataJson.set(data, j);
  }
  return j;
};

const conversationStarts = new Map<string, string>();
let previousCommit: string | undefined;

for (const hashId of firstParent) {
  const c = commits.get(hashId)!;
  const tree = treeAt(hashId);
  readBlobs(tree.values());
  const short = hashId.slice(0, 7);

  // Pages, following renames; a note re-added under its own name with another extension kept its
  // identity, and the similar file Git pairs it with was split out of it.
  const renames = renamesAt(hashId, c.parents[0]);
  const moved = new Map<string, string>();
  for (const [from, to] of renames) {
    if (!(pages.has(from) && isPage(to))) continue;
    const id = from.replace(/\.(mdx?|yaml)$/, '');
    const same = [...tree.keys()].find(
      (p) => p !== from && p.replace(/\.(mdx?|yaml)$/, '') === id && !pages.has(p),
    );
    moved.set(from, same ?? to);
  }
  for (const [from, to] of moved) {
    const s = pages.get(from)!;
    pages.delete(from);
    pages.set(to, { ...s, path: to });
  }
  const isWikiPage = (p: string) => /\.mdx?$/.test(p) && !p.startsWith('captures/');
  // Pages removed in this commit: merged into another page that now lists the name, or removed.
  const gone = [...pages.keys()].filter((p) => !tree.has(p));
  const changed: string[] = [];
  for (const [path, sha] of tree) {
    if (!isWikiPage(path)) continue;
    const s = pages.get(path);
    if (s && s.sha === sha) continue;
    const projection = projectPage(path, blobs.get(sha)!);
    const key = s?.key ?? `page:${path.replace(/\.mdx?$/, '')}@${short}`;
    if (s) match(s.projection.blocks, projection.blocks, (n) => `${key}/n/${short}/${n}`);
    else match([], projection.blocks, (n) => `${key}/n/${short}/${n}`);
    pages.set(path, { key, path, sha, projection, retired: s?.retired ?? new Map() });
    changed.push(path);
    pageLog.push([hashId, path, idOf(key)]);
    const content = textOfTree(projection.blocks);
    if (content !== projection.text) {
      report.textMismatches.push(`${short} ${path}`);
      if (process.env.SHOW_MISMATCH && !shown.has(path)) {
        shown.add(path);
        let i = 0;
        while (content[i] === projection.text[i]) i++;
        console.error(
          `${short} ${path} @${i}\n  tree:   ${JSON.stringify(content.slice(Math.max(0, i - 40), i + 60))}\n  source: ${JSON.stringify(projection.text.slice(Math.max(0, i - 40), i + 60))}`,
        );
      }
    }
  }

  // Captures and the vocabulary.
  const captureSpecs: Specs = new Map();
  const exchangeTexts = new Map<string, string>();
  const conversationTitles = new Map<string, { startedAt: string; title: string }>();
  let schemaSpecs: Specs = new Map();
  for (const [path, sha] of tree) {
    if (path.startsWith('captures/')) {
      let p = captureCache.get(sha + path);
      if (!p) {
        p = projectCapture(path, blobs.get(sha)!);
        captureCache.set(sha + path, p);
      }
      for (const [k, v] of p.specs) captureSpecs.set(k, v);
      for (const [k, v] of p.texts) exchangeTexts.set(k, v);
      for (const [k, v] of p.titles) {
        const known = conversationTitles.get(k);
        if (!known || Date.parse(v.startedAt) < Date.parse(known.startedAt))
          conversationTitles.set(k, v);
      }
    } else if (path === 'meta/schema.yaml') {
      let s = schemaCache.get(sha);
      if (!s) {
        s = projectSchema(blobs.get(sha)!);
        schemaCache.set(sha, s);
      }
      schemaSpecs = s;
    }
  }
  atHead = hashId === firstParent.at(-1);

  // Name index: page paths without extension, then aliases.
  const byName = new Map<string, PageState>();
  for (const s of pages.values())
    if (tree.has(s.path)) byName.set(s.path.replace(/\.mdx?$/, ''), s);
  for (const s of pages.values())
    if (tree.has(s.path))
      for (const a of s.projection.page.aliases ?? []) if (!byName.has(a)) byName.set(a, s);

  for (const path of gone) {
    const s = pages.get(path)!;
    pages.delete(path);
    if (!isWikiPage(path)) continue;
    const name = path.replace(/\.mdx?$/, '');
    const into = [...byName.values()].find(
      (o) =>
        (o.projection.page.aliases ?? []).includes(name) ||
        (o.projection.page.aliases ?? []).includes(s.projection.page.title),
    );
    // Everything under a removed page keeps its last versions; only the page itself is deleted.
    for (const k of specsOfPage(s, byName, new Map()).keys())
      if (k !== s.key || into) keepAlive.add(idOf(k));
    if (into) {
      kept.set(`${s.key}/merged-into`, {
        parent: s.key,
        order: '0z',
        data: { kind: 'relationship', predicate: 'merged-into' },
        target: { node: into.key },
      });
      report.merged.push({ page: name, into: into.path });
    } else report.removedPages.push(`${short} ${name}`);
  }

  // Lifecycle records that left a page this commit stay under it: a question is abandoned, since the
  // history points to no answer; a task keeps its state until an outcome is recorded.
  for (const path of changed) {
    const s = pages.get(path)!;
    const before = previousRecords.get(s.key) ?? new Map<string, Tree>();
    const now = new Set(s.projection.records.map((r) => r.natural!));
    for (const [naturalKey, record] of before) {
      if (
        now.has(naturalKey) ||
        !['question', 'task'].includes(record.data.kind) ||
        s.retired.has(naturalKey)
      )
        continue;
      const retired: Tree = { ...record, children: [...record.children] };
      if (record.data.kind === 'question') {
        retired.data = { ...record.data, abandoned: true };
        report.abandoned.push({ question: record.data.text, page: path });
      } else report.tasks.push({ task: record.data.what, page: path, status: record.data.status });
      s.retired.set(naturalKey, retired);
    }
    // A record that returns to the page is live again.
    for (const k of now) s.retired.delete(k);
    previousRecords.set(s.key, new Map(s.projection.records.map((r) => [r.natural!, r])));
  }

  // The desired state at this commit.
  const specs: Specs = new Map(identitySpecs);
  for (const [k, v] of schemaSpecs) specs.set(k, v);
  for (const s of pages.values())
    if (tree.has(s.path))
      for (const [k, v] of specsOfPage(s, byName, captureSpecs)) specs.set(k, v);
  for (const [k, { title }] of conversationTitles)
    specs.set(k, {
      parent: null,
      order: 'a',
      data: { kind: 'conversation', title, createdAt: 'pending' },
    });
  for (const [k, v] of captureSpecs) specs.set(k, v);
  // Undeclared tags become terms of their own.
  for (const v of [...specs.values()]) {
    const term = (v.target as any)?.term as string | undefined;
    if (term?.startsWith('tag:') && !specs.has(`term:${term}`)) {
      if (!specs.has('term:scheme:tag'))
        specs.set('term:scheme:tag', {
          parent: null,
          order: 'a',
          data: { kind: 'term', scheme: 'scheme', key: 'tag' },
        });
      specs.set(`term:${term}`, {
        parent: 'term:scheme:tag',
        order: `u${term}`,
        data: { kind: 'term', scheme: 'tag', key: term.slice(4) },
      });
    }
  }
  for (const [k, v] of kept) specs.set(k, v);
  const resolved = resolveAll(specs, byName, captureSpecs);

  // Weather readings take their coordinates from the place page they were read at; the place is an
  // exact reference to that page's version, fixed when the reading is recorded.
  const id = txId(`commit:${hashId}`);
  const pendingPlaces: { ref: string; reading: string; place: string }[] = [];
  for (const [k, v] of resolved) {
    if (!v.data.pendingWeather) continue;
    const w = v.data.pendingWeather;
    const place = typeof w.at === 'string' ? byName.get(w.at) : undefined;
    const geo = place?.projection.page.geo;
    if (!geo) {
      if (!state.get(idOf(k))?.alive) report.weatherWithoutPlace.push(`${k} at ${w.at}`);
      resolved.delete(k);
      continue;
    }
    const exchange = resolved.get(v.parent!)!;
    const value = {
      latitude: geo.lat,
      longitude: geo.lon,
      intervalSeconds: null,
      ...(w.temp_c !== undefined ? { temperatureC: w.temp_c } : {}),
      ...(w.feels_like_c !== undefined ? { apparentTemperatureC: w.feels_like_c } : {}),
      ...(w.humidity !== undefined ? { humidityPercent: w.humidity } : {}),
      ...(w.precipitation_mm !== undefined ? { precipitationMm: w.precipitation_mm } : {}),
      ...(w.cloud_cover !== undefined ? { cloudPercent: w.cloud_cover } : {}),
      ...(w.wind_ms !== undefined ? { windMps: w.wind_ms } : {}),
      ...(w.daylight !== undefined ? { daylight: !!w.daylight } : {}),
      raw: w,
    };
    resolved.set(k, {
      ...v,
      data: {
        kind: 'observation',
        subject: 'weather',
        source: { kind: 'application', name: 'vault capture' },
        time: {
          requested: null,
          observed: exchange.data.startedAt,
          received: null,
          elapsedMs: null,
        },
        outcome: {
          status: 'collected',
          value,
          quality: { method: 'coordinates of the place page' },
        },
      },
    });
    const ref = `${k}/place`;
    if (frozenExact.has(ref)) resolved.set(ref, frozenExact.get(ref)!);
    else pendingPlaces.push({ ref, reading: k, place: place!.key });
  }
  // A conversation began at the earliest time any revision gives its exchanges and messages.
  for (const [k, v] of resolved) {
    const conversation =
      v.data.kind === 'exchange'
        ? v.parent
        : v.data.kind === 'message'
          ? resolved.get(v.parent!)?.parent
          : undefined;
    if (!conversation) continue;
    const at = v.data.startedAt ?? v.data.at;
    const known = conversationStarts.get(conversation);
    if (!known || Date.parse(at) < Date.parse(known)) conversationStarts.set(conversation, at);
    void k;
  }

  // Difference from the previous state.
  const changes: Record<string, any>[] = [];
  const live = new Set<string>();
  for (const [key, spec] of resolved) {
    const nodeId = idOf(key);
    live.add(nodeId);
    const placement = spec.parent ? { parent: idOf(spec.parent), order: spec.order } : null;
    let connection: any = null;
    if (spec.exact) {
      const [sKey, sTx] = spec.exact.source;
      const [tKey, tTx] = spec.exact.target;
      connection = {
        source: { node: idOf(sKey), transaction: sTx },
        target: { node: idOf(tKey), transaction: tTx },
      };
    } else if ((spec as any).resolvedTarget)
      connection = {
        source: { node: idOf(spec.parent ?? key) },
        target: { node: idOf((spec as any).resolvedTarget) },
      };
    const text = `${jsonOf(spec.data)}|${placement ? `${placement.parent} ${placement.order}` : ''}|${connection ? JSON.stringify(connection) : ''}`;
    const prior = state.get(nodeId);
    if (prior?.alive && prior.json === text) continue;
    changes.push({
      node: nodeId,
      expected: prior?.transaction ?? null,
      placement,
      connection,
      data: spec.data,
    });
    state.set(nodeId, {
      json: text,
      transaction: id,
      alive: true,
      placement,
      connection,
      data: spec.data,
    });
  }
  // A reading's place cites the exact versions of the reading and the page as now recorded.
  for (const { ref, reading, place } of pendingPlaces) {
    const spec: Spec = {
      parent: reading,
      order: 'a',
      data: { kind: 'metadataReference', role: 'place' },
      exact: {
        source: [reading, state.get(idOf(reading))!.transaction],
        target: [place, state.get(idOf(place))!.transaction],
      },
    };
    frozenExact.set(ref, spec);
    const nodeId = idOf(ref);
    live.add(nodeId);
    const placement = { parent: idOf(reading), order: 'a' };
    const connection = {
      source: { node: idOf(reading), transaction: spec.exact!.source[1] },
      target: { node: idOf(place), transaction: spec.exact!.target[1] },
    };
    changes.push({ node: nodeId, expected: null, placement, connection, data: spec.data });
    state.set(nodeId, {
      json: `${jsonOf(spec.data)}|${placement.parent} ${placement.order}|${JSON.stringify(connection)}`,
      transaction: id,
      alive: true,
      placement,
      connection,
      data: spec.data,
    });
  }
  for (const [nodeId, prior] of state) {
    if (!prior.alive || live.has(nodeId) || existingNodes.has(nodeId) || keepAlive.has(nodeId))
      continue;
    changes.push({
      node: nodeId,
      expected: prior.transaction,
      placement: prior.placement,
      connection: prior.connection,
      data: null,
    });
    state.set(nodeId, { ...prior, json: '', transaction: id, alive: false });
  }
  previousCommit = hashId;
  if (!changes.length) {
    report.skippedCommits.push(`${short} ${c.message.split('\n')[0]}`);
    continue;
  }
  // Side-branch commits arrive with their merge; their messages stay with it.
  const included = c.parents
    .slice(1)
    .flatMap((p) => git('rev-list', p, `^${c.parents[0]}`).trim().split('\n').filter(Boolean))
    .map((h) => commits.get(h)!.message.split('\n')[0]);
  const message = included.length
    ? `${c.message}\n\nIncludes:\n${included.map((m) => `- ${m}`).join('\n')}`
    : c.message;
  requests.push({
    request: {
      id,
      recordedBy: idOf(authorOf(c.author)),
      origin: null,
      kind: IMPORT,
      message,
      undoOf: null,
      changes,
    },
    recordedAt: c.author.at,
    commit: hashId,
  });
}
void previousCommit;

// ---- Per-commit helpers (hoisted) -----------------------------------------------------------------

function specsOfPage(s: PageState, byName: Map<string, PageState>, _captures: Specs): Specs {
  const specs: Specs = new Map();
  specs.set(s.key, { parent: null, order: 'a', data: s.projection.page });
  // Frontmatter records first, then the body; both keep fractional order keys.
  const records = [...s.projection.records, ...s.retired.values()];
  const place = (
    trees: Tree[],
    parent: string,
    floor: string,
    ceiling: string | null,
    keyOf: (t: Tree) => string,
  ) => {
    const keys = trees.map(keyOf);
    const prev = keys.map((k) => orders.get(idOf(k)));
    const order = orderKeys(prev, floor, ceiling);
    trees.forEach((t, i) => {
      const key = keys[i]!;
      orders.set(idOf(key), order[i]!);
      const { data } = t;
      const target =
        t.target && 'path' in t.target && t.target.path === ''
          ? { ...t.target, path: s.path }
          : t.target;
      specs.set(key, { parent, order: order[i]!, data, ...(target ? { target } : {}) });
      place(t.children, key, '0', null, (c) => (c.natural ? `${key}/${c.natural}` : c.key!));
    });
  };
  place(records, s.key, '0', '1', (t) => `${s.key}/${t.natural}`);
  // Body blocks sort after frontmatter records.
  place(s.projection.blocks, s.key, '1', null, (t) => t.key!);
  // Section anchors, for links into this page.
  slugIndex.set(s.key, new Map([...s.projection.slugs].map(([slug, t]) => [slug, t.key!])));
  void byName;
  return specs;
}

function resolveAll(specs: Specs, byName: Map<string, PageState>, captures: Specs): Specs {
  const out: Specs = new Map();
  for (const [key, spec] of specs) {
    if (!spec.target || spec.exact) {
      out.set(key, spec);
      continue;
    }
    const r = spec.target;
    let target: string | null = null;
    if ('node' in r) target = r.node;
    else if ('term' in r) target = specs.has(`term:${r.term}`) ? `term:${r.term}` : null;
    else if ('resource' in r) target = `resource:${r.resource}`;
    else if ('page' in r) target = byName.get(r.page)?.key ?? null;
    else if (r.path.startsWith('captures/')) {
      const p = r.path.endsWith('.md') ? r.path : `${r.path}.md`;
      const ex = `exchange:${p}${r.anchor ? `#${r.anchor}` : ''}`;
      target = captures.has(ex) ? ex : null;
    } else {
      const page = byName.get(r.path.replace(/\.mdx?$/, ''));
      target = page
        ? r.anchor
          ? (slugIndex.get(page.key)?.get(r.anchor) ?? page.key)
          : page.key
        : null;
    }
    // A relationship keeps what the source named only while its object is unresolved.
    const { label: _named, ...unlabelled } = spec.data;
    const data = target && spec.data.kind === 'relationship' ? unlabelled : { ...spec.data };
    if (!target && atHead)
      report.unresolvedAtHead.push({ node: key, ref: r, label: data.label ?? data.text });
    out.set(key, { ...spec, data, ...(target ? { resolvedTarget: target } : {}) } as Spec);
    if (target?.startsWith('resource:') && !specs.has(target) && !out.has(target))
      out.set(target, {
        parent: null,
        order: 'a',
        data: { kind: 'resource', url: target.slice(9) },
      });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Outcomes the owner stated on 2026-10-11, for follow-ups that left their pages without one, and the
// new commitment stated with them. Recorded now, by the owner, after the imported history.

{
  const id = txId('owner-outcomes-2026-10-11');
  const changes: Record<string, any>[] = [];
  const taskNode = (what: string) => {
    const suffix = `/task/${hash(what)}`;
    const key = Object.keys(identityMap).find(
      (k) => k.endsWith(suffix) && state.get(identityMap[k]!)?.alive,
    );
    if (!key) throw new Error(`No task: ${what}`);
    return idOf(key);
  };
  const outcomes: [string, 'completed' | 'abandoned'][] = [
    ['Renew the gym membership', 'completed'],
    [
      'Look into more settings for the Map Rando Archipelago configuration, especially quality-of-life options',
      'completed',
    ],
    ['Work out a title and responsibilities that could fit Jonathan in AIP', 'abandoned'],
    ["Check Ruth's weight and possibly take her to the vet", 'completed'],
  ];
  for (const [what, status] of outcomes) {
    const nodeId = taskNode(what);
    const prior = state.get(nodeId)!;
    const data = { ...(prior.data as Record<string, any>), status };
    changes.push({
      node: nodeId,
      expected: prior.transaction,
      placement: prior.placement,
      connection: prior.connection,
      data,
    });
  }
  // A new commitment: Agnes's client duties.
  const agnes = Object.entries(identityMap).find(
    ([k, n]) =>
      k.startsWith('page:') &&
      !k.includes('/') &&
      (state.get(n)?.data as any)?.title === 'Agnes Zhou',
  );
  if (!agnes) throw new Error('No page for Agnes Zhou');
  const what = "Take over Agnes's duties relating to clients";
  const last =
    [...state.values()]
      .filter((v: any) => v.alive && v.placement?.parent === agnes[1] && v.placement.order < '1')
      .map((v: any) => v.placement.order)
      .sort()
      .at(-1) ?? '0';
  const task = {
    node: idOf(`${agnes[0]}/task/${hash(what)}`),
    expected: null,
    placement: { parent: agnes[1], order: between(last, '1') },
    connection: null,
    data: { kind: 'task', what, status: 'open' },
  };
  changes.push(task);
  requests.push({
    request: {
      id,
      recordedBy: OWNER,
      origin: null,
      kind: { scope: 'node', action: 'update' },
      message: 'Record follow-up outcomes stated by the owner',
      undoOf: null,
      changes,
    },
    recordedAt: RECORDED.outcomes,
    commit: null,
  });
}

// ---------------------------------------------------------------------------------------------------
// Validate every version with its owning schema, accept after the existing history, read back, write.

const startOf = new Map([...conversationStarts].map(([k, at]) => [idOf(k), at]));
for (const { request } of requests)
  for (const ch of request.changes)
    if (ch.data?.kind === 'conversation')
      ch.data = { ...ch.data, createdAt: startOf.get(ch.node)! };
const chatParsers: Record<string, (v: unknown) => unknown> = {
  conversation: chat.parseConversation,
  exchange: chat.parseExchange,
  message: chat.parseMessage,
  reference: chat.parseChatReference,
  observation: parseMetadata,
  metadataReference: parseMetadataReference,
};
const kinds: Record<string, number> = {};
for (const { request } of requests)
  for (const ch of request.changes) {
    if (ch.data === null) continue;
    tally(kinds, ch.data.kind);
    try {
      (chatParsers[ch.data.kind] ?? parseVaultRecord)(ch.data);
    } catch (e: any) {
      throw new Error(
        `${request.message?.split('\n')[0]}: invalid ${ch.data.kind} ${JSON.stringify(ch.data).slice(0, 300)}\n${e.message.slice(0, 600)}`,
      );
    }
  }
let records: any[] = [...existing];
const envelopes: any[] = [];
for (const { request, recordedAt } of requests) {
  const parsed = parseCommit(request);
  let record: (typeof records)[number];
  try {
    record = accept(records, parsed, await digest(parsed), recordedAt);
  } catch (e: any) {
    const keyOf = Object.fromEntries(Object.entries(identityMap).map(([k, v]) => [v, k]));
    const id = /[0-9a-f-]{36}/.exec(e.message)?.[0];
    const holder = request.changes.find((ch: any) => JSON.stringify(ch).includes(id ?? ''));
    throw new Error(
      `${request.message.split('\n')[0]}: ${e.message} (${keyOf[id!]}) in ${keyOf[holder?.node]}`,
    );
  }
  records = [...records, record];
  envelopes.push(JSON.parse(JSON.stringify(record)));
}
const reloaded = validateRecords(
  records.map((e) => parseRecord(JSON.parse(JSON.stringify(e)))),
  existing,
);
const snapshot = snapshotOf(reloaded);
// Containment: every container holds only what its kind allows.
const violations: string[] = [];
for (const v of Object.values(identityMap)
  .map((n) => snapshot.get(n))
  .filter(Boolean) as any[]) {
  const allows = containment[v.data?.kind];
  if (!allows) continue;
  snapshot.children(v.key.node).forEach((c: any, i: number) => {
    if (!allows(c.data.kind, i)) violations.push(`${v.data.kind} contains ${c.data.kind} at ${i}`);
  });
}
const store = nodeInterface({
  read: () => reloaded,
  append: () => Promise.reject(new Error('read-only')),
  cached: async () => {},
  refresh: async () => {},
  clear: async () => {},
  close: () => {},
  subscribe: () => () => {},
});
const chats = await savedChats(store);
let transcript: unknown[] = [];
for (const c of chats) transcript = [...transcript, ...(await savedMessages(store, c.node))];

rmSync(OUT, { recursive: true, force: true });
const NAMESPACE = join(OUT, '.vaulter/nodes/v1/transactions');
mkdirSync(NAMESPACE, { recursive: true });
for (const e of envelopes)
  writeFileSync(
    join(NAMESPACE, `${encodeURIComponent(e.transaction.id)}.json`),
    `${JSON.stringify(e)}\n`,
  );
writeFileSync(join(OUT, 'identity-map.json'), `${JSON.stringify(identityMap)}\n`);
writeFileSync(join(OUT, 'pages.json'), `${JSON.stringify(pageLog)}\n`);
writeFileSync(
  join(OUT, 'transactions.json'),
  `${JSON.stringify(Object.fromEntries(requests.map(({ request, commit }) => [request.id, commit])))}\n`,
);
const live: Record<string, number> = {};
for (const n of Object.values(identityMap)) {
  const v = snapshot.get(n);
  if (v?.data) tally(live, String(v.data.kind));
}
const summary = {
  vault: HEAD,
  existingTransactions: existing.length,
  transactions: envelopes.length,
  sequences: [envelopes[0].transaction.sequence, envelopes.at(-1).transaction.sequence],
  reloaded: reloaded.length,
  versions: envelopes.reduce((n, e) => n + e.versions.length, 0),
  versionKinds: kinds,
  liveKinds: live,
  megabytes: Math.round(envelopes.reduce((n, e) => n + JSON.stringify(e).length, 0) / 1e5) / 10,
  conversations: chats.length,
  recentConversations: chats
    .slice(0, 12)
    .map((c: any) => `${c.activeAt.slice(0, 16)}  ${c.data.title}`),
  transcriptReadBack: transcript.length,
  containmentViolations: violations.length,
  report: { ...report, unresolvedAtHead: report.unresolvedAtHead.length },
};
writeFileSync(
  join(OUT, 'summary.json'),
  `${JSON.stringify({ ...summary, report, violations: violations.slice(0, 50) }, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
