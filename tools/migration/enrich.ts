// Read a published Git snapshot; emit only new envelopes into a fresh scratch directory.
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { nodeInterface } from '../../app/vault/nodes/backend.ts';
import { accept, snapshotOf, validateRecords } from '../../app/vault/nodes/history.ts';
import { digest } from '../../app/vault/nodes/json.ts';
import { parseRecord, parseCommit } from '../../app/vault/nodes/validation.ts';
import { readCitation } from '../../app/vault/records/citations.ts';
import { parseVaultRecord } from '../../app/vault/records/index.ts';
import { recordText } from '../../app/vault/records/text.ts';
import { containment } from '../../app/vault/records/wiki.ts';
import { readWiki } from '../../app/workflows/wiki/pages.ts';
import { planEnrichment, reviewedEvidence } from './enrichment.ts';
import { NODE_PREFIX } from './source.ts';
import { publishedVault } from './published.ts';

const option = (name: string, fallback: string) => {
  const index = process.argv.lastIndexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing --${name} value`);
  return value;
};
const vault = realpathSync(resolve(option('vault', '../vault')));
const out = resolve(option('out', join(tmpdir(), 'wiki-enrichment')));
const parent = realpathSync(dirname(out));
const destination = join(parent, out.split('/').at(-1)!);
const insideVault = relative(vault, destination);
if (!insideVault || (!insideVault.startsWith('../') && insideVault !== '..'))
  throw new Error('Enrichment output must be outside the source vault');
const { head, records: baseline } = publishedVault(vault, option('vault-ref', 'HEAD'));
const reviewPath = option('review', '');
const review = reviewPath
  ? reviewedEvidence.parse(JSON.parse(readFileSync(resolve(reviewPath), 'utf8')))
  : undefined;
const plan = planEnrichment(baseline, review);
const request = plan.request && parseCommit(plan.request);
const envelope =
  request && accept(baseline, request, await digest(request), new Date().toISOString());
const reloaded = validateRecords(
  envelope ? [...baseline, parseRecord(JSON.parse(JSON.stringify(envelope)))] : baseline,
  baseline,
);
const before = snapshotOf(baseline);
const after = snapshotOf(reloaded);
const walk = (view: typeof after) => {
  const all: ReturnType<typeof view.children>[number][] = [];
  const visit = (node: ReturnType<typeof view.children>[number]) => {
    all.push(node);
    for (const child of view.children(node.key.node)) visit(child);
  };
  for (const root of view.roots()) visit(root);
  return all;
};
const originals = walk(before);
for (const node of originals) {
  if (after.get(node.key.node) !== node) throw new Error('Existing node changed during enrichment');
  if (recordText(node, before) !== recordText(node, after))
    throw new Error('Enrichment changed original text');
}
for (const node of walk(after)) {
  const allows = containment[String(node.data?.kind)];
  if (allows)
    after.children(node.key.node).forEach((child, index) => {
      if (!allows(String(child.data?.kind), index))
        throw new Error(`Invalid containment: ${node.data?.kind} / ${child.data?.kind}`);
    });
}
const checkedSnapshots = new Map<number, ReturnType<typeof snapshotOf>>();
const checkedSnapshot = (sequence: number) => {
  let view = checkedSnapshots.get(sequence);
  if (!view) {
    view = snapshotOf(reloaded, sequence);
    checkedSnapshots.set(sequence, view);
  }
  return view;
};
for (const node of envelope?.versions ?? []) {
  if (node.data) parseVaultRecord(node.data);
  if (node.data?.claim) readCitation(node, checkedSnapshot);
  if (node.data?.scope === 'page' && node.connection && typeof node.data.sequence === 'number') {
    const view = checkedSnapshot(node.data.sequence);
    if (
      !node.connection.target.transaction ||
      view.get(node.connection.target.node)?.key.transaction !== node.connection.target.transaction
    )
      throw new Error('Page reference snapshot does not select its exact endpoint');
  }
}
const store = nodeInterface({
  read: () => reloaded,
  append: () => Promise.reject(new Error('Read-only verification')),
  cached: async () => undefined,
  refresh: async () => undefined,
  clear: async () => undefined,
  close: () => undefined,
  subscribe: () => () => undefined,
});
const pages = await readWiki(store, (node) => `#/chat/${encodeURIComponent(node)}/`);
const allBlocks = pages.flatMap((page) =>
  page.blocks.flatMap(function flatten(block): typeof page.blocks {
    return [block, ...block.children.flatMap(flatten)];
  }),
);
const renderedCitations = new Set(
  allBlocks.flatMap((block) => block.evidence.map((reference) => reference.id)),
);
for (const version of envelope?.versions ?? []) {
  if (version.data?.claim && !renderedCitations.has(version.key.node))
    throw new Error('New citation is missing from Wiki readback');
}
const retry = planEnrichment(reloaded, review);
if (retry.request) throw new Error('Enrichment is not idempotent');
const { issues, reviewQueue, ...counts } = plan.report;
const report = {
  ...counts,
  sourceCommit: head,
  appendedTransactions: envelope ? 1 : 0,
  originalNodesPreserved: originals.length,
  originalTextPreserved: true,
  renderedPages: pages.length,
  renderedPageReferences: pages.reduce((count, page) => count + page.sources.length, 0),
  issues: issues.length,
  idempotent: true,
};
// Refuse to overwrite any output. The CLI cannot publish or modify the source vault.
mkdirSync(destination);
const namespace = join(destination, NODE_PREFIX);
mkdirSync(namespace, { recursive: true });
if (envelope)
  writeFileSync(
    join(namespace, `${encodeURIComponent(envelope.transaction.id)}.json`),
    `${JSON.stringify(envelope)}\n`,
  );
writeFileSync(join(destination, 'request.json'), `${JSON.stringify(request, null, 2)}\n`);
writeFileSync(
  join(destination, 'report.json'),
  `${JSON.stringify({ ...report, unresolved: issues, reviewQueue }, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
