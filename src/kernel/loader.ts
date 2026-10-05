// The loader: from a commit's tree to a plan per extension, the compiled modules it needs with every
// import resolved. The kernel compiles (compile.ts), then links a plan into
// blob: modules in this page (link.ts) and loads it.
//
// What a file may import:
//   ./x.ts, ../x.ts   a file in the same extension folder (or, from a contract, in contracts/)
//   #contracts/name   a contract: contracts/name/index.ts
//   the shared modules the kernel offers: #kernel, zod, react, react/jsx-runtime, react-dom/client
// Anything else is a problem for that extension alone; the others still load.
import type { Compiled } from './compile.ts';
import type { Refused } from './resolve.ts';
import type { KernelKeep } from './storage.ts';

/** A commit's files under extensions/ and contracts/, by path, with each one's blob sha. */
export interface Tree {
  commit: string;
  files: Map<string, string>;
}

export interface PlannedModule {
  code: string;
  /** Each import's place in `code` and what it resolves to: a path in the plan, or `shared:<spec>`. */
  imports: { start: number; end: number; quoted: boolean; target: string }[];
}

export interface Plan {
  commit: string;
  entry: string;
  modules: Record<string, PlannedModule>;
  /** The sha of every file in it, by path. */
  shas: Record<string, string>;
}

export interface LoaderDeps {
  /** A file's text at the tree's commit. */
  read: (path: string, sha: string) => Promise<string>;
  /** Compiled output by blob sha; absent in tests. */
  keep?: KernelKeep;
  /** The specifiers the kernel offers as shared modules. */
  shared: readonly string[];
}

export interface Stats {
  files: number;
  compiled: number;
  compileMs: number;
  totalMs: number;
}

/** Bump when the output changes for the same input, so the cache isn't reused across compilers. */
export const COMPILER = 'sucrase-1';
const EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

/** Every folder in extensions/ with an index.ts or index.tsx: id → entry path. */
export function extensionsIn(tree: Tree): Map<string, string> {
  const found = new Map<string, string>();
  for (const path of [...tree.files.keys()].sort()) {
    const m = /^extensions\/([^/]+)\/index\.tsx?$/.exec(path);
    if (m && !found.has(m[1])) found.set(m[1], path);
  }
  return found;
}

export function planner(tree: Tree, deps: LoaderDeps) {
  const stats: Stats = { files: 0, compiled: 0, compileMs: 0, totalMs: 0 };
  const compiled = new Map<string, Promise<Compiled>>();

  const compileOne = (path: string, sha: string) => {
    let done = compiled.get(path);
    if (!done) {
      done = (async () => {
        const key = `compiled:${COMPILER}:${sha}`;
        const hit = await deps.keep?.get<Compiled>(key);
        if (hit) return hit;
        const text = await deps.read(path, sha);
        // The compiler loads only on a cache miss: a start from cache never fetches it.
        const { compile } = await import('./compile.ts');
        const t = performance.now();
        const out = await compile(path, text);
        stats.compileMs += performance.now() - t;
        stats.compiled++;
        await deps.keep?.set(key, out);
        return out;
      })();
      compiled.set(path, done);
    }
    return done;
  };

  const resolveSpec = (from: string, spec: string): string => {
    if (deps.shared.includes(spec)) return `shared:${spec}`;
    let target: string;
    if (spec.startsWith('#contracts/')) {
      target = `contracts/${spec.slice('#contracts/'.length)}/index.ts`;
    } else if (spec.startsWith('./') || spec.startsWith('../')) {
      target = join(from, spec);
      const scope = from.startsWith('contracts/')
        ? 'contracts/'
        : `${from.split('/', 2).join('/')}/`;
      if (!target.startsWith(scope))
        throw new Error(`${from}: "${spec}" is outside ${scope} (use #contracts/… for a contract)`);
    } else
      throw new Error(
        `${from}: "${spec}" is not available; shared modules are ${deps.shared.join(', ')}`,
      );
    const found = EXTS.map((e) => target + e).find((p) => tree.files.has(p));
    if (!found) throw new Error(`${from}: "${spec}" not found at this commit`);
    return found;
  };

  /** The plan for one entry file and everything it imports. */
  async function plan(entry: string): Promise<Plan> {
    if (!tree.files.has(entry)) throw new Error(`${entry} not found at this commit`);
    const t0 = performance.now();
    const modules: Record<string, PlannedModule> = {};
    const shas: Record<string, string> = {};
    /** `path` compiled, with each import resolved to a file in the plan or a shared module. */
    const module = async (path: string): Promise<PlannedModule> => {
      const sha = tree.files.get(path);
      if (!sha) throw new Error(`${path} not found at this commit`);
      shas[path] = sha;
      const { code, imports } = await compileOne(path, sha);
      stats.files++;
      return {
        code,
        imports: imports.map(({ spec, ...at }) => ({ ...at, target: resolveSpec(path, spec) })),
      };
    };
    const visit = async (path: string, stack: string[]): Promise<void> => {
      if (stack.includes(path)) throw new Error(`an import cycle: ${[...stack, path].join(' → ')}`);
      if (path in modules) return;
      const m = await module(path);
      modules[path] = m;
      for (const i of m.imports)
        if (!i.target.startsWith('shared:')) await visit(i.target, [...stack, path]);
    };
    await visit(entry, []);
    stats.totalMs += performance.now() - t0;
    return { commit: tree.commit, entry, modules, shas };
  }

  return { plan, stats, tree };
}

/** A plan for every extension in the tree, except `skip`; one that can't be planned is refused. */
export async function planAll(tree: Tree, deps: LoaderDeps, skip = new Set<string>()) {
  const p = planner(tree, deps);
  const plans = new Map<string, Plan>();
  const refused: Refused[] = [];
  await Promise.all(
    [...extensionsIn(tree)]
      .filter(([id]) => !skip.has(id))
      .map(async ([id, entry]) => {
        try {
          plans.set(id, await p.plan(entry));
        } catch (e) {
          refused.push({ id, problems: [(e as Error).message] });
        }
      }),
  );
  const sorted = new Map([...plans].sort(([a], [b]) => a.localeCompare(b)));
  return { plans: sorted, refused, stats: p.stats, planner: p };
}

/** `from`'s folder joined with a relative `spec`, normalised. */
function join(from: string, spec: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const p of spec.split('/')) {
    if (p === '..') parts.pop();
    else if (p !== '.') parts.push(p);
  }
  return parts.join('/');
}
