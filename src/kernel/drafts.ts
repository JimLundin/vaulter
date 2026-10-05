// Drafts: extensions changed on draft/* branches (ARCHITECTURE.md, "Extension lifecycle"). A
// device that tries a draft loads the main branch with the draft's changed folders on top. Reviewing a
// draft compares the two trees and each changed extension's static fields, so what it newly asks for
// (a host, a secret, a device, a powerful contract) is shown to approve on purpose.
import type { Checks, SourceV1 } from '@contracts/extensions.source';
import type { Review, StaticsSummary } from '@contracts/kernel';
import type { Statics } from './extension.ts';
import { extensionsIn, type Tree } from './loader.ts';

/** `extensions/<id>/…` → id; a contract's file → `contracts`. */
const unitOf = (path: string) =>
  path.startsWith('extensions/')
    ? path.split('/')[1]
    : path.startsWith('contracts/')
      ? 'contracts'
      : null;

/** A unit's files, in path order. */
const filesOf = (tree: Tree, unit: string) =>
  [...tree.files].filter(([p]) => unitOf(p) === unit).sort(([a], [b]) => a.localeCompare(b));

const same = (a: [string, string][], b: [string, string][]) =>
  a.length === b.length && a.every(([p, s], i) => b[i][0] === p && b[i][1] === s);

/** The extensions (and `contracts`) a draft adds, changes or removes against `main`. */
export function changedUnits(main: Tree, draft: Tree): string[] {
  const units = new Set([...main.files.keys(), ...draft.files.keys()].map(unitOf).filter(Boolean));
  return [...units]
    .filter((u) => !same(filesOf(main, u!), filesOf(draft, u!)))
    .sort((a, b) => a!.localeCompare(b!)) as string[];
}

/** The main tree with each draft's changed folders in place of main's; later drafts win. */
export function overlay(main: Tree, drafts: { branch: string; tree: Tree }[]) {
  const files = new Map(main.files);
  const origins = new Map<string, string>();
  for (const d of drafts)
    for (const unit of changedUnits(main, d.tree)) {
      for (const [p] of filesOf({ commit: '', files }, unit)) files.delete(p);
      for (const [p, s] of filesOf(d.tree, unit)) files.set(p, s);
      if (unit !== 'contracts') origins.set(unit, d.branch);
    }
  const commit = [main.commit, ...drafts.map((d) => d.tree.commit.slice(0, 7))].join('+');
  return { tree: { commit, files }, origins };
}

export const summary = (s: Statics): StaticsSummary => ({
  version: s.version,
  // Optional contracts count: a draft that may use kernel@1 when present can use it.
  requires: [...Object.values(s.requires), ...Object.values(s.optional)].map((c) => c.key),
  provides: Object.values(s.provides).map((c) => c.key),
  device: s.permissions.device,
  network: s.permissions.network,
  secrets: Object.entries(s.secrets).map(([name, x]) => ({ name, hosts: x.hosts })),
  author: s.author,
});

/** Contracts that let an extension change Vaulter itself. */
const POWERFUL: Record<string, string> = {
  'kernel@1': 'manage extensions, access and approvals',
};

/** What `after` may do that `before` couldn't. */
export function raises(before: StaticsSummary | undefined, after: StaticsSummary): string[] {
  const out: string[] = [];
  const added = (a: string[], b: string[] = []) => a.filter((x) => !b.includes(x));
  for (const h of added(after.network, before?.network)) out.push(`reach ${h}`);
  for (const d of added(after.device, before?.device)) out.push(`use the ${d}`);
  const hosts = (s?: StaticsSummary) =>
    s?.secrets.map((x) => `${x.name}: ${x.hosts.join(', ')}`) ?? [];
  for (const s of added(hosts(after), hosts(before))) out.push(`hold a secret (${s})`);
  for (const k of added(after.requires, before?.requires))
    out.push(POWERFUL[k] ? `${POWERFUL[k]} (${k})` : `use ${k}`);
  for (const k of added(after.provides, before?.provides)) out.push(`provide ${k}`);
  return out;
}

export interface ReviewEnv {
  src: SourceV1;
  repo: string;
  ref: string;
  treeAt: (commit: string) => Promise<Tree>;
  /** The static fields of an extension's plan, read by loading it. */
  inspect: (id: string, tree: Tree, entry: string) => Promise<Statics>;
}

export async function review(env: ReviewEnv, branch: string): Promise<Review> {
  const [base, head] = await Promise.all([
    env.src.head(env.repo, env.ref),
    env.src.head(env.repo, branch),
  ]);
  const [main, draft] = await Promise.all([env.treeAt(base), env.treeAt(head)]);
  const files = [...new Set([...main.files.keys(), ...draft.files.keys()])]
    .filter((p) => main.files.get(p) !== draft.files.get(p))
    .sort((a, b) => a.localeCompare(b))
    .map((path) => ({
      path,
      status: (!main.files.has(path) ? 'added' : !draft.files.has(path) ? 'removed' : 'changed') as
        | 'added'
        | 'changed'
        | 'removed',
    }));
  const entriesMain = extensionsIn(main);
  const entriesDraft = extensionsIn(draft);
  const extensions = await Promise.all(
    changedUnits(main, draft)
      .filter((u) => u !== 'contracts')
      .map(async (id) => {
        const problems: string[] = [];
        const read = async (tree: Tree, entry: string | undefined) => {
          if (!entry) return;
          try {
            return summary(await env.inspect(id, tree, entry));
          } catch (e) {
            problems.push((e as Error).message);
          }
        };
        const before = await read(main, entriesMain.get(id));
        const after = await read(draft, entriesDraft.get(id));
        const change: 'added' | 'changed' | 'removed' = !entriesMain.has(id)
          ? 'added'
          : !entriesDraft.has(id)
            ? 'removed'
            : 'changed';
        return { id, change, before, after, raises: after ? raises(before, after) : [], problems };
      }),
  );
  const checks: Checks = await env.src
    .checks(env.repo, head)
    .catch(() => ({ state: 'none', runs: [] }));
  return { branch, base, head, files, extensions, checks };
}
