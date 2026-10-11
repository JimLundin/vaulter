// Migration of the Markdown vault into Vaulter's node records (docs/specs/vault-records.md).
//
// Replays the vault's first-parent history as `vault.import` transactions, each recorded by its
// original author at its original time with its original message. Every revision of a page becomes
// a tree of Wiki nodes; consecutive revisions are matched node by node so an edit versions only what
// it changed. Every version is validated with its owning schema; the result is accepted after the
// application's existing node history and revalidated exactly as the GitHub adapter loads it.
// Writes nothing into the vault or the app.
//
//   node tools/migration/migrate.ts --vault ../vault [--vault-ref origin/main] [--out <dir>]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultIdentities } from '../../app/application-identities.ts';
import { nodeInterface } from '../../app/vault/nodes/backend.ts';
import { accept, snapshotOf, validateRecords } from '../../app/vault/nodes/history.ts';
import { canonical, compare, digest } from '../../app/vault/nodes/json.ts';
import type { Connection, JsonObject, Placement } from '../../app/vault/nodes/model.ts';
import { type NodeRecord, parseCommit, parseRecord } from '../../app/vault/nodes/validation.ts';
import { parseVaultRecord } from '../../app/vault/records/index.ts';
import { containment } from '../../app/vault/records/wiki.ts';
import {
  parseMetadata,
  parseMetadataReference,
} from '../../app/workflows/chat/records/chat-metadata-schema.ts';
import {
  parseChatReference,
  parseConversation,
  parseExchange,
  parseMessage,
} from '../../app/workflows/chat/records/chat-schema.ts';
import { savedChats, savedMessages } from '../../app/workflows/chat/records/chat-store.ts';
import {
  consolidatedEntries,
  type CaptureProjection,
  PENDING_WEATHER,
  projectCapture,
} from './captures.ts';
import { between, hash, orderKeys, uuid } from './keys.ts';
import {
  aliasesOf,
  match,
  type PageProjection,
  projectPage,
  textOfTree,
  type Tree,
} from './pages.ts';
import { asObject, type Data, type Spec, type Specs } from './records.ts';
import { report, tally } from './report.ts';
import { isPage, openSource, type Person } from './source.ts';
import { projectSchema } from './vocabulary.ts';

const option = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const VAULT = resolve(option('vault', '../vault'));
const OUT = resolve(option('out', join(tmpdir(), 'vault-migration')));
const source = openSource(VAULT, option('vault-ref', 'origin/main'));
const { head: HEAD, commits, firstParent } = source;

const OWNER = defaultIdentities.user;
const AGENT = defaultIdentities.agent;
const IMPORT = { scope: 'vault', action: 'import' } as const;
/** When the migration's own transactions were first recorded; a re-run keeps them, so it reproduces
 * the published history exactly. */
const RECORDED = {
  authors: '2026-10-11T05:55:23.150Z',
  outcomes: '2026-10-11T05:56:36.984Z',
} as const;

// ---- Identities -----------------------------------------------------------------------------------

const fixed: Record<string, string> = { owner: OWNER, agent: AGENT };
const identityMap: Record<string, string> = {};
const idOf = (key: string): string => {
  identityMap[key] ??= fixed[key] ?? uuid(key);
  return identityMap[key];
};
const txId = (key: string) => `vault:${uuid(`transaction:${key}`)}`;

/** Who a source commit's author is: the owner, the application's agent, or an agent of their own. */
const authors = {
  owner: 'owner',
  claude: 'agent:claude',
  librarian: 'agent:librarian',
  agent: 'agent',
} as const;
function authorOf({ name, email }: Person): string {
  if (name === 'Jim Lundin' || /JimLundin@users\.noreply\.github\.com$/i.test(email))
    return authors.owner;
  if (name === 'Claude') return authors.claude;
  if (name === 'Vaulter Librarian') return authors.librarian;
  if (name === 'Vaulter') return authors.agent;
  throw new Error(`Unmapped author ${name} <${email}>`);
}

// ---- State ----------------------------------------------------------------------------------------

/** A node's last recorded version, as the replay compares it. */
interface State {
  json: string;
  transaction: string;
  alive: boolean;
  placement: Placement | null;
  connection: Connection | null;
  data: JsonObject | null;
}
interface Change {
  node: string;
  expected: string | null;
  placement: Placement | null;
  connection: Connection | null;
  data: JsonObject | null;
}
interface Planned {
  request: {
    id: string;
    recordedBy: string;
    origin: null;
    kind: { scope: string; action: string };
    message: string;
    undoOf: null;
    changes: Change[];
  };
  recordedAt: string;
  /** The source commit, for an imported transaction. */
  commit: string | null;
}
const versionText = (
  data: JsonObject,
  placement: Placement | null,
  connection: Connection | null,
) =>
  `${canonical(data)}|${placement ? `${placement.parent} ${placement.order}` : ''}|${connection ? JSON.stringify(connection) : ''}`;
const dataJson = new WeakMap<object, string>();
/** A version's comparison text; record payloads are reused across revisions, so each is serialised once. */
const specText = (data: Data, placement: Placement | null, connection: Connection | null) => {
  let text = dataJson.get(data);
  if (text === undefined) {
    text = canonical(data);
    dataJson.set(data, text);
  }
  return `${text}|${placement ? `${placement.parent} ${placement.order}` : ''}|${connection ? JSON.stringify(connection) : ''}`;
};

const existing = source.nodeHistory();
const existingNodes = new Set<string>();
const state = new Map<string, State>();
for (const r of existing)
  for (const v of r.versions) {
    existingNodes.add(v.key.node);
    state.set(v.key.node, {
      json: v.data === null ? '' : versionText(v.data, v.placement, v.connection),
      transaction: r.transaction.id,
      alive: v.data !== null,
      placement: v.placement,
      connection: v.connection,
      data: v.data,
    });
  }

const planned: Planned[] = [];
{
  const agents = [
    [authors.claude, 'Claude'],
    [authors.librarian, 'Vaulter Librarian'],
  ] as const;
  const id = txId('identities');
  const changes: Change[] = agents.map(([key, name]) => ({
    node: idOf(key),
    expected: null,
    placement: null,
    connection: null,
    data: { kind: 'agent', name },
  }));
  planned.push({
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

// ---- Pages ----------------------------------------------------------------------------------------

interface PageState {
  key: string; // page identity key
  path: string;
  sha: string;
  projection: PageProjection;
  /** Lifecycle records that left the page, kept under it with their final state. */
  retired: Map<string, Tree>;
}
const pages = new Map<string, PageState>(); // path → state
const previousRecords = new Map<string, Map<string, Tree>>(); // page key → its last frontmatter records
const orders = new Map<string, string>(); // node → its order key, kept across revisions
const slugIndex = new Map<string, Map<string, string>>(); // page key → heading slug → section key
const pageLog: [commit: string, path: string, node: string][] = [];
/** Nodes under removed pages keep their last versions; a merged page also keeps itself and its link. */
const keepAlive = new Set<string>();
const kept: Specs = new Map();
const frozenExact = new Map<string, Spec>(); // exact references, fixed when first recorded
const captureCache = new Map<string, CaptureProjection>();
const schemaCache = new Map<string, Specs>();
const conversationStarts = new Map<string, string>();
const shown = new Set<string>();
let atHead = false;

const isWikiPage = (path: string) => /\.mdx?$/.test(path) && !path.startsWith('captures/');
const nameOf = (path: string) => path.replace(/\.mdx?$/, '');

/** A page's nodes as specifications: frontmatter records in ('0', '1'), then its body. */
function specsOfPage(s: PageState): Specs {
  const specs: Specs = new Map();
  specs.set(s.key, { parent: null, order: 'a', data: s.projection.page });
  const place = (
    trees: readonly Tree[],
    parent: string,
    floor: string,
    ceiling: string | null,
    keyOf: (t: Tree) => string,
  ) => {
    const keys = trees.map(keyOf);
    const order = orderKeys(
      keys.map((k) => orders.get(idOf(k))),
      floor,
      ceiling,
    );
    trees.forEach((t, i) => {
      const key = keys[i]!;
      orders.set(idOf(key), order[i]!);
      const target =
        t.target && 'path' in t.target && t.target.path === ''
          ? { ...t.target, path: s.path }
          : t.target;
      specs.set(key, { parent, order: order[i]!, data: t.data, ...(target ? { target } : {}) });
      place(t.children, key, '0', null, (c) => (c.natural ? `${key}/${c.natural}` : c.key!));
    });
  };
  place(
    [...s.projection.records, ...s.retired.values()],
    s.key,
    '0',
    '1',
    (t) => `${s.key}/${t.natural}`,
  );
  place(s.projection.blocks, s.key, '1', null, (t) => t.key!);
  // Section anchors, for links into this page.
  slugIndex.set(s.key, new Map([...s.projection.slugs].map(([slug, t]) => [slug, t.key!])));
  return specs;
}

/** Resolve each reference against this revision; an unresolved relationship keeps its label. */
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
      const path = r.path.endsWith('.md') ? r.path : `${r.path}.md`;
      const exchange = `exchange:${path}${r.anchor ? `#${r.anchor}` : ''}`;
      target = captures.has(exchange) ? exchange : null;
    } else {
      const page = byName.get(nameOf(r.path));
      target = page
        ? r.anchor
          ? (slugIndex.get(page.key)?.get(r.anchor) ?? page.key)
          : page.key
        : null;
    }
    const { label: _named, ...unlabelled } = spec.data;
    const data: Data = target && spec.data.kind === 'relationship' ? unlabelled : { ...spec.data };
    if (!target && atHead)
      report.unresolvedAtHead.push({ node: key, ref: r, label: data.label ?? data.text });
    out.set(key, { ...spec, data, ...(target ? { resolvedTarget: target } : {}) });
    if (target?.startsWith('resource:') && !specs.has(target) && !out.has(target))
      out.set(target, {
        parent: null,
        order: 'a',
        data: { kind: 'resource', url: target.slice('resource:'.length) },
      });
  }
  return out;
}

// Old per-topic capture files were consolidated into day logs; each consolidated entry names its file.
const headTree = source.treeAt(HEAD);
const dayLogs = [...headTree.keys()].filter((p) => /^captures\/\d{4}-\d{2}-\d{2}\.md$/.test(p));
source.readBlobs(dayLogs.map((p) => headTree.get(p)!));
const consolidated = consolidatedEntries(dayLogs.map((p) => [p, source.blob(headTree.get(p)!)]));

// ---- Replay ---------------------------------------------------------------------------------------

for (const commitHash of firstParent) {
  const c = commits.get(commitHash)!;
  const tree = source.treeAt(commitHash);
  source.readBlobs(tree.values());
  const short = commitHash.slice(0, 7);

  // Pages, following renames; a note re-added under its own name with another extension kept its
  // identity, and the similar file Git pairs it with was split out of it.
  const moved = new Map<string, string>();
  for (const [from, to] of source.renamesAt(commitHash, c.parents[0])) {
    if (!(pages.has(from) && isPage(to))) continue;
    const name = from.replace(/\.(mdx?|yaml)$/, '');
    const same = [...tree.keys()].find(
      (p) => p !== from && p.replace(/\.(mdx?|yaml)$/, '') === name && !pages.has(p),
    );
    moved.set(from, same ?? to);
  }
  for (const [from, to] of moved) {
    const s = pages.get(from)!;
    pages.delete(from);
    pages.set(to, { ...s, path: to });
  }
  // Pages removed in this commit: merged into another page that now lists the name, or removed.
  const gone = [...pages.keys()].filter((p) => !tree.has(p));
  const changed: string[] = [];
  for (const [path, sha] of tree) {
    if (!isWikiPage(path)) continue;
    const prior = pages.get(path);
    if (prior?.sha === sha) continue;
    const projection = projectPage(path, source.blob(sha));
    const key = prior?.key ?? `page:${nameOf(path)}@${short}`;
    match(prior?.projection.blocks ?? [], projection.blocks, (n) => `${key}/n/${short}/${n}`);
    pages.set(path, { key, path, sha, projection, retired: prior?.retired ?? new Map() });
    changed.push(path);
    pageLog.push([commitHash, path, idOf(key)]);
    const content = textOfTree(projection.blocks);
    if (content !== projection.text) {
      report.textMismatches.push(`${short} ${path}`);
      if (process.env.SHOW_MISMATCH && !shown.has(path)) {
        shown.add(path);
        let i = 0;
        while (content[i] === projection.text[i]) i++;
        const around = (text: string) => JSON.stringify(text.slice(Math.max(0, i - 40), i + 60));
        console.error(
          `${short} ${path} @${i}\n  tree:   ${around(content)}\n  source: ${around(projection.text)}`,
        );
      }
    }
  }

  // Captures and the vocabulary.
  const captureSpecs: Specs = new Map();
  const conversationTitles = new Map<string, { startedAt: string; title: string }>();
  let schemaSpecs: Specs = new Map();
  for (const [path, sha] of tree) {
    if (path.startsWith('captures/')) {
      let capture = captureCache.get(sha + path);
      if (!capture) {
        capture = projectCapture(path, source.blob(sha), consolidated);
        captureCache.set(sha + path, capture);
      }
      for (const [k, v] of capture.specs) captureSpecs.set(k, v);
      for (const [k, v] of capture.titles) {
        const earliest = conversationTitles.get(k);
        if (!earliest || Date.parse(v.startedAt) < Date.parse(earliest.startedAt))
          conversationTitles.set(k, v);
      }
    } else if (path === 'meta/schema.yaml') {
      let vocabulary = schemaCache.get(sha);
      if (!vocabulary) {
        vocabulary = projectSchema(source.blob(sha));
        schemaCache.set(sha, vocabulary);
      }
      schemaSpecs = vocabulary;
    }
  }
  atHead = commitHash === firstParent.at(-1);

  // Name index: page paths without extension, then aliases.
  const byName = new Map<string, PageState>();
  for (const s of pages.values()) if (tree.has(s.path)) byName.set(nameOf(s.path), s);
  for (const s of pages.values())
    if (tree.has(s.path))
      for (const alias of aliasesOf(s.projection.page))
        if (!byName.has(alias)) byName.set(alias, s);

  for (const path of gone) {
    const s = pages.get(path)!;
    pages.delete(path);
    if (!isWikiPage(path)) continue;
    const name = nameOf(path);
    const into = [...byName.values()].find((o) => {
      const aliases = aliasesOf(o.projection.page);
      return aliases.includes(name) || aliases.includes(String(s.projection.page.title));
    });
    // Everything under a removed page keeps its last versions; only the page itself is deleted.
    for (const k of specsOfPage(s).keys()) if (k !== s.key || into) keepAlive.add(idOf(k));
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
      const { kind } = record.data;
      if (
        now.has(naturalKey) ||
        !(kind === 'question' || kind === 'task') ||
        s.retired.has(naturalKey)
      )
        continue;
      const retired: Tree = { ...record, children: [...record.children] };
      if (kind === 'question') {
        retired.data = { ...record.data, abandoned: true };
        report.abandoned.push({ question: String(record.data.text), page: path });
      } else
        report.tasks.push({
          task: String(record.data.what),
          page: path,
          status: String(record.data.status),
        });
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
    if (tree.has(s.path)) for (const [k, v] of specsOfPage(s)) specs.set(k, v);
  for (const [k, { title }] of conversationTitles)
    specs.set(k, {
      parent: null,
      order: 'a',
      data: { kind: 'conversation', title, createdAt: 'pending' },
    });
  for (const [k, v] of captureSpecs) specs.set(k, v);
  // Undeclared tags become terms of their own.
  for (const v of [...specs.values()]) {
    const term = v.target && 'term' in v.target ? v.target.term : undefined;
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
        data: { kind: 'term', scheme: 'tag', key: term.slice('tag:'.length) },
      });
    }
  }
  for (const [k, v] of kept) specs.set(k, v);
  const resolved = resolveAll(specs, byName, captureSpecs);

  // Weather readings take their coordinates from the place page they were read at; the place is an
  // exact reference to that page's version, fixed when the reading is recorded.
  const id = txId(`commit:${commitHash}`);
  const pendingPlaces: { ref: string; reading: string; place: string }[] = [];
  for (const [k, v] of resolved) {
    if (v.data.kind !== PENDING_WEATHER) continue;
    const w = asObject(v.data.reading);
    const place = typeof w.at === 'string' ? byName.get(w.at) : undefined;
    const geo = place ? asObject(place.projection.page.geo) : {};
    if (!(place && geo.lat !== undefined)) {
      if (!state.get(idOf(k))?.alive) report.weatherWithoutPlace.push(`${k} at ${String(w.at)}`);
      resolved.delete(k);
      continue;
    }
    const exchange = resolved.get(v.parent!)!;
    const value: JsonObject = {
      latitude: geo.lat ?? null,
      longitude: geo.lon ?? null,
      intervalSeconds: null,
      ...(w.temp_c === undefined ? {} : { temperatureC: w.temp_c }),
      ...(w.feels_like_c === undefined ? {} : { apparentTemperatureC: w.feels_like_c }),
      ...(w.humidity === undefined ? {} : { humidityPercent: w.humidity }),
      ...(w.precipitation_mm === undefined ? {} : { precipitationMm: w.precipitation_mm }),
      ...(w.cloud_cover === undefined ? {} : { cloudPercent: w.cloud_cover }),
      ...(w.wind_ms === undefined ? {} : { windMps: w.wind_ms }),
      ...(w.daylight === undefined ? {} : { daylight: !!w.daylight }),
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
          observed: exchange.data.startedAt ?? null,
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
    const fixedRef = frozenExact.get(ref);
    if (fixedRef) resolved.set(ref, fixedRef);
    else pendingPlaces.push({ ref, reading: k, place: place.key });
  }
  // A conversation began at the earliest time any revision gives its exchanges and messages.
  for (const v of resolved.values()) {
    const conversation =
      v.data.kind === 'exchange'
        ? v.parent
        : v.data.kind === 'message'
          ? resolved.get(v.parent!)?.parent
          : undefined;
    if (!conversation) continue;
    const at = String(v.data.startedAt ?? v.data.at);
    const earliest = conversationStarts.get(conversation);
    if (!earliest || Date.parse(at) < Date.parse(earliest))
      conversationStarts.set(conversation, at);
  }

  // Difference from the previous state.
  const changes: Change[] = [];
  const live = new Set<string>();
  for (const [key, spec] of resolved) {
    const nodeId = idOf(key);
    live.add(nodeId);
    const placement = spec.parent ? { parent: idOf(spec.parent), order: spec.order } : null;
    let connection: Connection | null = null;
    if (spec.exact) {
      const [sourceKey, sourceTx] = spec.exact.source;
      const [targetKey, targetTx] = spec.exact.target;
      connection = {
        source: { node: idOf(sourceKey), transaction: sourceTx },
        target: { node: idOf(targetKey), transaction: targetTx },
      };
    } else if (spec.resolvedTarget)
      connection = {
        source: { node: idOf(spec.parent ?? key) },
        target: { node: idOf(spec.resolvedTarget) },
      };
    const text = specText(spec.data, placement, connection);
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
    const readingTx = state.get(idOf(reading))!.transaction;
    const placeTx = state.get(idOf(place))!.transaction;
    const spec: Spec = {
      parent: reading,
      order: 'a',
      data: { kind: 'metadataReference', role: 'place' },
      exact: { source: [reading, readingTx], target: [place, placeTx] },
    };
    frozenExact.set(ref, spec);
    const nodeId = idOf(ref);
    live.add(nodeId);
    const placement = { parent: idOf(reading), order: 'a' };
    const connection = {
      source: { node: idOf(reading), transaction: readingTx },
      target: { node: idOf(place), transaction: placeTx },
    };
    changes.push({ node: nodeId, expected: null, placement, connection, data: spec.data });
    state.set(nodeId, {
      json: specText(spec.data, placement, connection),
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
  if (!changes.length) {
    report.skippedCommits.push(`${short} ${c.message.split('\n')[0]}`);
    continue;
  }
  // Side-branch commits arrive with their merge; their messages stay with it.
  const included = source.sideCommits(c).map((h) => commits.get(h)!.message.split('\n')[0]);
  const message = included.length
    ? `${c.message}\n\nIncludes:\n${included.map((m) => `- ${m}`).join('\n')}`
    : c.message;
  planned.push({
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
    commit: commitHash,
  });
}

// ---- The owner's outcomes -------------------------------------------------------------------------

// Outcomes the owner stated on 2026-10-11, for follow-ups that left their pages without one, and the
// new commitment stated with them: a transaction of the owner's own, after the imported history.
{
  const id = txId('owner-outcomes-2026-10-11');
  const changes: Change[] = [];
  const outcomes: [what: string, status: 'completed' | 'abandoned'][] = [
    ['Renew the gym membership', 'completed'],
    [
      'Look into more settings for the Map Rando Archipelago configuration, especially quality-of-life options',
      'completed',
    ],
    ['Work out a title and responsibilities that could fit Jonathan in AIP', 'abandoned'],
    ["Check Ruth's weight and possibly take her to the vet", 'completed'],
  ];
  for (const [what, status] of outcomes) {
    const suffix = `/task/${hash(what)}`;
    const key = Object.keys(identityMap).find(
      (k) => k.endsWith(suffix) && state.get(identityMap[k]!)?.alive,
    );
    const prior = key ? state.get(identityMap[key]!) : undefined;
    if (!(key && prior?.data)) throw new Error(`No task: ${what}`);
    changes.push({
      node: idOf(key),
      expected: prior.transaction,
      placement: prior.placement,
      connection: prior.connection,
      data: { ...prior.data, status },
    });
  }
  // A new commitment: Agnes's client duties.
  const agnes = Object.entries(identityMap).find(
    ([k, n]) =>
      k.startsWith('page:') && !k.includes('/') && state.get(n)?.data?.title === 'Agnes Zhou',
  );
  if (!agnes) throw new Error('No page for Agnes Zhou');
  const [agnesKey, agnesNode] = agnes;
  const what = "Take over Agnes's duties relating to clients";
  const last =
    [...state.values()]
      .flatMap((v) =>
        v.alive && v.placement?.parent === agnesNode && v.placement.order < '1'
          ? [v.placement.order]
          : [],
      )
      .sort(compare)
      .at(-1) ?? '0';
  changes.push({
    node: idOf(`${agnesKey}/task/${hash(what)}`),
    expected: null,
    placement: { parent: agnesNode, order: between(last, '1') },
    connection: null,
    data: { kind: 'task', what, status: 'open' },
  });
  planned.push({
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

// ---- Validate, accept, read back, write -----------------------------------------------------------

const startOf = new Map([...conversationStarts].map(([k, at]) => [idOf(k), at]));
for (const { request } of planned)
  for (const ch of request.changes)
    if (ch.data?.kind === 'conversation')
      ch.data = { ...ch.data, createdAt: startOf.get(ch.node)! };

const chatParsers: Record<string, (value: unknown) => unknown> = {
  conversation: parseConversation,
  exchange: parseExchange,
  message: parseMessage,
  reference: parseChatReference,
  observation: parseMetadata,
  metadataReference: parseMetadataReference,
};
const kinds: Record<string, number> = {};
for (const { request } of planned)
  for (const ch of request.changes) {
    if (ch.data === null) continue;
    const kind = String(ch.data.kind);
    tally(kinds, kind);
    try {
      (chatParsers[kind] ?? parseVaultRecord)(ch.data);
    } catch (error) {
      throw new Error(
        `${request.message.split('\n')[0]}: invalid ${kind} ${JSON.stringify(ch.data).slice(0, 300)}`,
        { cause: error },
      );
    }
  }

const keyOfNode = (node: string | undefined) =>
  Object.entries(identityMap).find(([, n]) => n === node)?.[0];
let records: readonly NodeRecord[] = existing;
const envelopes: NodeRecord[] = [];
for (const { request, recordedAt } of planned) {
  const parsed = parseCommit(request);
  // biome-ignore lint/performance/noAwaitInLoops: each transaction is accepted after the previous one.
  const requestDigest = await digest(parsed);
  let record: NodeRecord;
  try {
    record = accept(records, parsed, requestDigest, recordedAt);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const node = /[0-9a-f-]{36}/.exec(reason)?.[0];
    const holder = node
      ? request.changes.find((ch) => JSON.stringify(ch).includes(node))
      : undefined;
    throw new Error(
      `${request.message.split('\n')[0]}: ${reason} (${keyOfNode(node)}) in ${keyOfNode(holder?.node)}`,
      { cause: error },
    );
  }
  records = [...records, record];
  envelopes.push(JSON.parse(JSON.stringify(record)) as NodeRecord);
}
const reloaded = validateRecords(
  records.map((r) => parseRecord(JSON.parse(JSON.stringify(r)))),
  existing,
);
const snapshot = snapshotOf(reloaded);
// Containment: every container holds only what its kind allows.
const violations: string[] = [];
for (const nodeId of Object.values(identityMap)) {
  const version = snapshot.get(nodeId);
  const kind = version?.data ? String(version.data.kind) : '';
  const allows = containment[kind];
  if (!allows) continue;
  snapshot.children(nodeId).forEach((child, i) => {
    const childKind = String(child.data?.kind);
    if (!allows(childKind, i)) violations.push(`${kind} contains ${childKind} at ${i}`);
  });
}
const store = nodeInterface({
  read: () => reloaded,
  append: () => Promise.reject(new Error('read-only')),
  cached: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  clear: () => Promise.resolve(),
  close: () => undefined,
  subscribe: () => () => undefined,
});
const chats = await savedChats(store);
const transcripts = await Promise.all(chats.map((chat) => savedMessages(store, chat.node)));

rmSync(OUT, { recursive: true, force: true });
const namespace = join(OUT, '.vaulter/nodes/v1/transactions');
mkdirSync(namespace, { recursive: true });
for (const e of envelopes)
  writeFileSync(
    join(namespace, `${encodeURIComponent(e.transaction.id)}.json`),
    `${JSON.stringify(e)}\n`,
  );
writeFileSync(join(OUT, 'identity-map.json'), `${JSON.stringify(identityMap)}\n`);
writeFileSync(join(OUT, 'pages.json'), `${JSON.stringify(pageLog)}\n`);
writeFileSync(
  join(OUT, 'transactions.json'),
  `${JSON.stringify(Object.fromEntries(planned.map(({ request, commit }) => [request.id, commit])))}\n`,
);
const live: Record<string, number> = {};
for (const nodeId of Object.values(identityMap)) {
  const version = snapshot.get(nodeId);
  if (version?.data) tally(live, String(version.data.kind));
}
const summary = {
  vault: HEAD,
  existingTransactions: existing.length,
  transactions: envelopes.length,
  sequences: [envelopes[0]?.transaction.sequence, envelopes.at(-1)?.transaction.sequence],
  reloaded: reloaded.length,
  versions: envelopes.reduce((n, e) => n + e.versions.length, 0),
  versionKinds: kinds,
  liveKinds: live,
  megabytes: Math.round(envelopes.reduce((n, e) => n + JSON.stringify(e).length, 0) / 1e5) / 10,
  conversations: chats.length,
  recentConversations: chats
    .slice(0, 12)
    .map((chat) => `${chat.activeAt.slice(0, 16)}  ${chat.data.title}`),
  transcriptReadBack: transcripts.flat().length,
  containmentViolations: violations.length,
  report: { ...report, unresolvedAtHead: report.unresolvedAtHead.length },
};
writeFileSync(
  join(OUT, 'summary.json'),
  `${JSON.stringify({ ...summary, report, violations: violations.slice(0, 50) }, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
