// Independent check of a node migration against the vault's Git history. Loads the written envelopes
// with the source branch's existing node history, exactly as the GitHub adapter does, then checks:
// every version against its owning schema; containment at every transaction; every page revision's
// text, title and frontmatter records against its source; every turn verbatim; and each imported
// transaction's author, time and message against its source commit.
//
//   node verify-nodes.ts --vault ~/vault --app ~/vaulter --out /tmp/vault-migration
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const option = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const VAULT = resolve(option('vault', '../vault'));
const OUT = resolve(option('out', join(tmpdir(), 'vault-migration')));
const REF = option('vault-ref', 'origin/main');
import { parseRecord } from '../../app/vault/nodes/validation.ts';
import { validateRecords, snapshotOf } from '../../app/vault/nodes/history.ts';
import { parseVaultRecord } from '../../app/vault/records/index.ts';
import { containment } from '../../app/vault/records/wiki.ts';
import * as chat from '../../app/workflows/chat/records/chat-schema.ts';
import {
  parseMetadata,
  parseMetadataReference,
} from '../../app/workflows/chat/records/chat-metadata-schema.ts';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toString as textOf } from 'mdast-util-to-string';
import { CORE_SCHEMA, load } from 'js-yaml';
const md = unified().use(remarkParse).use(remarkGfm);

const git = (...a: string[]) =>
  execFileSync('git', ['-C', VAULT, ...a], { encoding: 'utf8', maxBuffer: 1 << 30 });
const PREFIX = '.vaulter/nodes/v1/transactions/';
const dir = join(OUT, PREFIX);
const written = readdirSync(dir).map((f) => {
  const r = parseRecord(JSON.parse(readFileSync(join(dir, f), 'utf8')));
  if (`${encodeURIComponent(r.transaction.id)}.json` !== f)
    throw new Error(`${f}: path does not match its identity`);
  return r;
});
const existing = git('ls-tree', '-r', '-z', '--name-only', REF, '--', PREFIX)
  .split('\0')
  .filter((p) => p && !/^(migration|vault):/.test(decodeURIComponent(p.slice(PREFIX.length)))) // earlier migrations are replaced
  .map((p) => parseRecord(JSON.parse(git('show', `${REF}:${p}`))));
const history = validateRecords(
  [...existing, ...written].sort(
    (a: any, b: any) => a.transaction.sequence - b.transaction.sequence,
  ),
);
const failures: string[] = [];
const fail = (s: string) => failures.length < 40 && failures.push(s);

// 1. Every version parses with its owning schema.
const chatParsers: Record<string, (v: unknown) => unknown> = {
  conversation: chat.parseConversation,
  exchange: chat.parseExchange,
  message: chat.parseMessage,
  reference: chat.parseChatReference,
  observation: parseMetadata,
  metadataReference: parseMetadataReference,
};
let versions = 0;
for (const r of history)
  for (const v of r.versions) {
    if (v.data === null) continue;
    versions++;
    try {
      (chatParsers[String(v.data.kind)] ?? parseVaultRecord)(v.data);
    } catch (e: any) {
      fail(`${r.transaction.sequence} ${v.data.kind}: ${e.message.slice(0, 200)}`);
    }
  }

// 2. Imported transactions are their source commits.
const txCommit: Record<string, string | null> = JSON.parse(
  readFileSync(join(OUT, 'transactions.json'), 'utf8'),
);
const authorName: Record<string, string> = {};
for (const r of history)
  for (const v of r.versions)
    if (v.data?.kind === 'actor' || v.data?.kind === 'agent')
      authorName[v.key.node] = String(v.data.name);
const expectedAuthor = (name: string, email: string) =>
  name === 'Jim Lundin' || /JimLundin@users/.test(email)
    ? 'Vault owner'
    : name === 'Vaulter'
      ? 'Vault agent'
      : name;
for (const r of history) {
  const commit = txCommit[r.transaction.id];
  if (!commit) continue;
  const [name, email, at, ...message] = git('log', '-1', '--format=%an%x00%ae%x00%aI%x00%B', commit)
    .replace(/\n+$/, '')
    .split('\0');
  if (authorName[r.transaction.recordedBy] !== expectedAuthor(name!, email!))
    fail(`${commit.slice(0, 7)}: author ${authorName[r.transaction.recordedBy]} for ${name}`);
  if (r.transaction.recordedAt !== new Date(at!).toISOString() && r.transaction.recordedAt !== at)
    fail(`${commit.slice(0, 7)}: recorded at ${r.transaction.recordedAt}, authored ${at}`);
  if (!(r.transaction.message ?? '').startsWith(message.join('\0')))
    fail(`${commit.slice(0, 7)}: message differs`);
  if (r.transaction.metadata !== undefined || r.transaction.origin !== null)
    fail(`${commit.slice(0, 7)}: has metadata or origin`);
}

// 3. Containment at every transaction, for what it changed.
const bySequence = history.map((r: any) => r);
let containers = 0;
for (const r of bySequence) {
  const snap = snapshotOf(history, r.transaction.sequence);
  const check = new Set<string>();
  for (const v of r.versions) {
    check.add(v.key.node);
    if (v.placement) check.add(v.placement.parent);
  }
  for (const n of check) {
    const v = snap.get(n);
    const kind = v?.data ? String(v.data.kind) : '';
    const allows = containment[kind];
    if (!allows) continue;
    containers++;
    snap.children(n).forEach((c: any, i: number) => {
      if (!allows(c.data.kind, i))
        fail(`${r.transaction.sequence}: ${kind} contains ${c.data.kind} at ${i}`);
    });
  }
}

// 4. Every page revision: title, text and frontmatter records match the source.
const front = /^﻿?---\r?\n([\s\S]*?\r?\n)---[ \t]*(?:\r?\n|$)/;
const WIKI = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
function sourceOf(path: string, text: string) {
  const m = front.exec(text);
  const fm = m ? ((load(m[1], { schema: CORE_SCHEMA }) as Record<string, any>) ?? {}) : {};
  let body = m ? text.slice(m[0].length) : text;
  if (path.endsWith('.mdx')) body = body.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  // Components are records of their own; their props are not page text.
  const lines: string[] = [];
  let tag = false;
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) fence = fence === null ? f[1]![0]! : fence === f[1]![0] ? null : fence;
    if (path.endsWith('.mdx') && fence === null && !f && (tag || /^\s*<[A-Z]/.test(line))) {
      tag = !/\/>\s*$/.test(line);
      continue;
    }
    lines.push(line);
  }
  const tree = md.parse(lines.join('\n'));
  let title: string | null = null;
  const parts: string[] = [];
  tree.children.forEach((n: any, i: number) => {
    if (i === 0 && n.type === 'heading' && n.depth === 1) title = textOf(n);
    else
      parts.push(
        n.type === 'code'
          ? n.value
          : textOf(n).replace(WIKI, (_: string, a: string, b?: string) => (b ?? a).trim()),
      );
  });
  return { fm, title, text: parts.join('').replace(/\s+/g, '') };
}
const list = (v: unknown) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const pageLog: [string, string, string][] = JSON.parse(
  readFileSync(join(OUT, 'pages.json'), 'utf8'),
);
const txOf = new Map(Object.entries(txCommit).flatMap(([tx, c]) => (c ? [[c, tx]] : [])));
const seqOf = new Map(history.map((r: any) => [r.transaction.id, r.transaction.sequence]));
let pagesChecked = 0;
let lastSnap: any = null;
let lastSeq = -1;
for (const [commit, path, pageNode] of pageLog) {
  const tx = txOf.get(commit);
  if (!tx) continue; // a commit whose changes were all already recorded
  const seq = seqOf.get(tx)!;
  if (seq !== lastSeq) {
    lastSnap = snapshotOf(history, seq);
    lastSeq = seq;
  }
  const snap = lastSnap;
  const page = snap.get(pageNode);
  if (!page?.data) {
    fail(`${commit.slice(0, 7)} ${path}: no live page`);
    continue;
  }
  const src = sourceOf(path, git('show', `${commit}:${path}`));
  pagesChecked++;
  const expectedTitle = (
    src.title ??
    path
      .replace(/\.mdx?$/, '')
      .split('/')
      .at(-1)!
  ).slice(0, 200);
  if (page.data.title !== expectedTitle)
    fail(`${commit.slice(0, 7)} ${path}: title ${page.data.title}`);
  const walk = (n: string): string =>
    snap
      .children(n)
      .map((c: any) =>
        c.data.kind === 'run' || c.data.kind === 'link' || c.data.kind === 'code'
          ? c.data.text
          : [
                'chart',
                'timeline',
                'query',
                'rule',
                'relationship',
                'question',
                'task',
                'decision',
                'date',
              ].includes(c.data.kind)
            ? ''
            : walk(c.key.node),
      )
      .join('');
  if (walk(pageNode).replace(/\s+/g, '') !== src.text)
    fail(`${commit.slice(0, 7)} ${path}: text differs`);
  // Frontmatter records: one live record per source entry.
  const children = snap.children(pageNode).map((c: any) => c.data);
  const count = (pred: (d: any) => boolean) => children.filter(pred).length;
  const fm = src.fm;
  const expected = {
    type: fm.type === undefined ? 0 : 1,
    tag: list(fm.tags).length,
    relation: Object.values(fm.relations ?? {}).flatMap(list).length,
    where: list(fm.where).length,
    question: 0,
    date:
      list(fm.dates).filter((d: any) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(d?.date))).length +
      (/^daily\/\d{4}-\d{2}-\d{2}\.md$/.test(path) ? 1 : 0),
    decision: list(fm.decisions).filter((d: any) =>
      /^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(d?.date)),
    ).length,
    task: 0,
  };
  // Questions and tasks are never deleted: each source entry has its live, unsettled record.
  const texts = (kind: string, field: string, live: (d: any) => boolean) =>
    new Set(children.filter((d: any) => d.kind === kind && live(d)).map((d: any) => d[field]));
  const openQuestions = texts('question', 'text', (d) => !d.abandoned);
  for (const q of list(fm.open).map(String))
    if (!openQuestions.has(q))
      fail(`${commit.slice(0, 7)} ${path}: open question missing: ${q.slice(0, 60)}`);
  const openTasks = texts('task', 'what', (d) => d.status === 'open');
  for (const t of list(fm['follow-ups']) as any[])
    if (!openTasks.has(String(t?.what ?? t)))
      fail(
        `${commit.slice(0, 7)} ${path}: follow-up missing: ${String(t?.what ?? t).slice(0, 60)}`,
      );
  const relationPredicates = new Set(Object.keys(fm.relations ?? {}));
  const actual = {
    type: count((d) => d.kind === 'relationship' && d.predicate === 'type'),
    tag: count((d) => d.kind === 'relationship' && d.predicate === 'tag'),
    relation: count((d) => d.kind === 'relationship' && relationPredicates.has(d.predicate)),
    where: count((d) => d.kind === 'relationship' && d.predicate === 'where'),
    question: 0,
    date: count((d) => d.kind === 'date'),
    decision: count((d) => d.kind === 'decision'),
    task: 0,
  };
  for (const k of Object.keys(expected) as (keyof typeof expected)[])
    if (expected[k] !== actual[k] && !(k === 'relation' && relationPredicates.has('where')))
      fail(`${commit.slice(0, 7)} ${path}: ${k} ${actual[k]} for ${expected[k]}`);
}

// 5. Every turn is verbatim in a capture log at the source head.
const head = snapshotOf(history);
const captures = git('ls-tree', '-r', '--name-only', REF, '--', 'captures')
  .trim()
  .split('\n')
  .map((p) => git('show', `${REF}:${p}`))
  .join('\n');
let turns = 0;
for (const r of history)
  for (const v of r.versions) {
    if (v.data?.kind !== 'message' || head.get(v.key.node)?.key.transaction !== r.transaction.id)
      continue;
    turns++;
    const data = v.data as Record<string, any>;
    const text = data.role === 'user' ? data.text : data.parts.map((p: any) => p.text).join('');
    if (!captures.includes(text)) fail(`message ${v.key.node}: not verbatim`);
  }

console.log(
  JSON.stringify(
    {
      transactions: history.length,
      versions,
      containersChecked: containers,
      pageRevisionsChecked: pagesChecked,
      turns,
      failures,
    },
    null,
    2,
  ),
);
if (failures.length) process.exit(1);
