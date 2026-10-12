// Independent check of a node migration against the vault's Git history. Loads the written envelopes
// with the source branch's existing node history, exactly as the GitHub adapter does, then checks:
// every version against its owning schema; containment at every transaction; every page revision's
// text, title and frontmatter records against its source; every turn verbatim; and each imported
// transaction's author, time and message against its source commit. Its reading of the sources is
// its own, not the migrator's.
//
//   node tools/migration/verify.ts --vault ../vault [--vault-ref origin/main] [--out <dir>]
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CORE_SCHEMA, load } from 'js-yaml';
import { toString as textOf } from 'mdast-util-to-string';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { snapshotOf, validateRecords } from '../../app/vault/nodes/history.ts';
import type { JsonObject, JsonValue, NodeVersion } from '../../app/vault/nodes/model.ts';
import { type NodeRecord, parseRecord } from '../../app/vault/nodes/validation.ts';
import { containment } from '../../app/workflows/wiki/records.ts';
import { asObject, json, list } from './records.ts';
import { NODE_PREFIX, openSource } from './source.ts';
import { parseMigrationRecord } from './wiki.ts';

const option = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const OUT = resolve(option('out', join(tmpdir(), 'vault-migration')));
const source = openSource(resolve(option('vault', '../vault')), option('vault-ref', 'origin/main'));
const { git, head: REF } = source;
const md = unified().use(remarkParse).use(remarkGfm);

const dir = join(OUT, NODE_PREFIX);
const written = readdirSync(dir).map((file) => {
  const record = parseRecord(JSON.parse(readFileSync(join(dir, file), 'utf8')));
  if (`${encodeURIComponent(record.transaction.id)}.json` !== file)
    throw new Error(`${file}: path does not match its identity`);
  return record;
});
const history: readonly NodeRecord[] = validateRecords(
  [...source.nodeHistory(), ...written].sort(
    (a, b) => a.transaction.sequence - b.transaction.sequence,
  ),
);
const failures: string[] = [];
const fail = (failure: string) => {
  if (failures.length < 40) failures.push(failure);
};
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
const kindOf = (data: JsonObject | null | undefined) => (data ? String(data.kind) : '');

// 1. Every version parses with its owning schema.
let versions = 0;
for (const r of history)
  for (const v of r.versions) {
    if (v.data === null) continue;
    versions++;
    try {
      parseMigrationRecord(v.data);
    } catch (error) {
      fail(`${r.transaction.sequence} ${kindOf(v.data)}: ${reason(error).slice(0, 200)}`);
    }
  }

// 2. Imported transactions are their source commits.
const txCommit = JSON.parse(readFileSync(join(OUT, 'transactions.json'), 'utf8')) as Record<
  string,
  string | null
>;
const authorName: Record<string, string> = {};
for (const r of history)
  for (const v of r.versions)
    if (v.data?.kind === 'actor' || v.data?.kind === 'agent')
      authorName[v.key.node] = String(v.data.name);
const expectedAuthor = (name: string, email: string) => {
  if (name === 'Jim Lundin' || /JimLundin@users/.test(email)) return 'Vault owner';
  return name === 'Vaulter' ? 'Vault agent' : name;
};
for (const r of history) {
  const commit = txCommit[r.transaction.id];
  if (!commit) continue;
  const [name = '', email = '', at = '', ...message] = git(
    'log',
    '-1',
    '--format=%an%x00%ae%x00%aI%x00%B',
    commit,
  )
    .replace(/\n+$/, '')
    .split('\0');
  if (authorName[r.transaction.recordedBy] !== expectedAuthor(name, email))
    fail(`${commit.slice(0, 7)}: author ${authorName[r.transaction.recordedBy]} for ${name}`);
  if (r.transaction.recordedAt !== new Date(at).toISOString() && r.transaction.recordedAt !== at)
    fail(`${commit.slice(0, 7)}: recorded at ${r.transaction.recordedAt}, authored ${at}`);
  if (!(r.transaction.message ?? '').startsWith(message.join('\0')))
    fail(`${commit.slice(0, 7)}: message differs`);
  if (r.transaction.metadata !== undefined || r.transaction.origin !== null)
    fail(`${commit.slice(0, 7)}: has metadata or origin`);
}

// 3. Containment at every transaction, for what it changed.
let containers = 0;
for (const r of history) {
  const snap = snapshotOf(history, r.transaction.sequence);
  const check = new Set<string>();
  for (const v of r.versions) {
    check.add(v.key.node);
    if (v.placement) check.add(v.placement.parent);
  }
  for (const nodeId of check) {
    const kind = kindOf(snap.get(nodeId)?.data);
    const allows = containment[kind];
    if (!allows) continue;
    containers++;
    snap.children(nodeId).forEach((child, i) => {
      if (!allows(kindOf(child.data), i))
        fail(`${r.transaction.sequence}: ${kind} contains ${kindOf(child.data)} at ${i}`);
    });
  }
}

// 4. Every page revision: title, text and frontmatter records match the source.
const FRONT = /^﻿?---\r?\n([\s\S]*?\r?\n)---[ \t]*(?:\r?\n|$)/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const WIKI = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
function sourceOf(path: string, text: string) {
  const m = FRONT.exec(text);
  const fm = m ? asObject(json(load(m[1]!, { schema: CORE_SCHEMA }))) : {};
  let body = m ? text.slice(m[0].length) : text;
  if (path.endsWith('.mdx')) body = body.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  // Components are records of their own; their props are not page text.
  const lines: string[] = [];
  let tag = false;
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const f = FENCE.exec(line);
    if (f) {
      const marker = f[1]![0]!;
      fence = fence === null ? marker : fence === marker ? null : fence;
    }
    if (path.endsWith('.mdx') && fence === null && !f && (tag || /^\s*<[A-Z]/.test(line))) {
      tag = !/\/>\s*$/.test(line);
      continue;
    }
    lines.push(line);
  }
  let title: string | null = null;
  const parts: string[] = [];
  md.parse(lines.join('\n')).children.forEach((n, i) => {
    if (i === 0 && n.type === 'heading' && n.depth === 1) title = textOf(n);
    else
      parts.push(
        n.type === 'code'
          ? n.value
          : textOf(n).replace(WIKI, (_: string, name: string, label?: string) =>
              (label ?? name).trim(),
            ),
      );
  });
  return { fm, title, text: parts.join('').replace(/\s+/g, '') };
}
const isDated = (value: JsonValue) => DATE.test(String(asObject(value).date));
const NO_TEXT = new Set([
  'chart',
  'timeline',
  'query',
  'rule',
  'relationship',
  'question',
  'task',
  'decision',
  'date',
]);
const pageLog = JSON.parse(readFileSync(join(OUT, 'pages.json'), 'utf8')) as [
  commit: string,
  path: string,
  node: string,
][];
const txOf = new Map(
  Object.entries(txCommit).flatMap(([tx, commit]): [string, string][] =>
    commit ? [[commit, tx]] : [],
  ),
);
const seqOf = new Map(history.map((r) => [r.transaction.id, r.transaction.sequence]));
let pagesChecked = 0;
let snap = snapshotOf(history);
let snapSequence = -1;
for (const [commit, path, pageNode] of pageLog) {
  const tx = txOf.get(commit);
  if (!tx) continue; // a commit whose changes were all already recorded
  const sequence = seqOf.get(tx)!;
  if (sequence !== snapSequence) {
    snap = snapshotOf(history, sequence);
    snapSequence = sequence;
  }
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
    fail(`${commit.slice(0, 7)} ${path}: title ${String(page.data.title)}`);
  const view = snap;
  const walk = (nodeId: string): string =>
    view
      .children(nodeId)
      .map((c: NodeVersion) => {
        const kind = kindOf(c.data);
        if (kind === 'run' || kind === 'link' || kind === 'code') return String(c.data?.text);
        return NO_TEXT.has(kind) ? '' : walk(c.key.node);
      })
      .join('');
  if (walk(pageNode).replace(/\s+/g, '') !== src.text)
    fail(`${commit.slice(0, 7)} ${path}: text differs`);
  // Frontmatter records: one live record per source entry.
  const children = snap.children(pageNode).flatMap((c) => (c.data ? [c.data] : []));
  const count = (pred: (d: JsonObject) => boolean) => children.filter(pred).length;
  const { fm } = src;
  const relations = asObject(fm.relations);
  const expected = {
    type: fm.type === undefined ? 0 : 1,
    tag: list(fm.tags).length,
    relation: Object.values(relations).flatMap((names) => list(names)).length,
    where: list(fm.where).length,
    date:
      list(fm.dates).filter(isDated).length + (/^daily\/\d{4}-\d{2}-\d{2}\.md$/.test(path) ? 1 : 0),
    decision: list(fm.decisions).filter(isDated).length,
  };
  const relationPredicates = new Set(Object.keys(relations));
  const isRelationship = (d: JsonObject, predicate: (p: string) => boolean) =>
    d.kind === 'relationship' && predicate(String(d.predicate));
  const actual = {
    type: count((d) => isRelationship(d, (p) => p === 'type')),
    tag: count((d) => isRelationship(d, (p) => p === 'tag')),
    relation: count((d) => isRelationship(d, (p) => relationPredicates.has(p))),
    where: count((d) => isRelationship(d, (p) => p === 'where')),
    date: count((d) => d.kind === 'date'),
    decision: count((d) => d.kind === 'decision'),
  };
  // A relations entry named where is counted with where as well.
  for (const k of Object.keys(expected) as (keyof typeof expected)[])
    if (expected[k] !== actual[k] && !(k === 'relation' && relationPredicates.has('where')))
      fail(`${commit.slice(0, 7)} ${path}: ${k} ${actual[k]} for ${expected[k]}`);
  // Questions and tasks are never deleted: each source entry has its live, unsettled record.
  const texts = (kind: string, field: string, open: (d: JsonObject) => boolean) =>
    new Set(children.filter((d) => d.kind === kind && open(d)).map((d) => String(d[field])));
  const openQuestions = texts('question', 'text', (d) => !d.abandoned);
  for (const q of list(fm.open).map(String))
    if (!openQuestions.has(q))
      fail(`${commit.slice(0, 7)} ${path}: open question missing: ${q.slice(0, 60)}`);
  const openTasks = texts('task', 'what', (d) => d.status === 'open');
  for (const value of list(fm['follow-ups'])) {
    const what = String(asObject(value).what ?? value);
    if (!openTasks.has(what))
      fail(`${commit.slice(0, 7)} ${path}: follow-up missing: ${what.slice(0, 60)}`);
  }
}

// 5. Every turn is verbatim in a capture log at the source head.
const head = snapshotOf(history);
const captures = git('ls-tree', '-r', '--name-only', REF, '--', 'captures')
  .trim()
  .split('\n')
  .map((path) => git('show', `${REF}:${path}`))
  .join('\n');
let turns = 0;
for (const r of history)
  for (const v of r.versions) {
    if (v.data?.kind !== 'message' || head.get(v.key.node)?.key.transaction !== r.transaction.id)
      continue;
    turns++;
    const text =
      v.data.role === 'user'
        ? String(v.data.text)
        : list(v.data.parts)
            .map((part) => String(asObject(part).text))
            .join('');
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
