// The loader: from a commit's tree to extension definitions. Each extension's files, and the contracts
// they import, are compiled (compile.ts), then linked bottom-up into module URLs, so every import points
// at a module that already exists. One module per file per commit: two extensions importing
// @contracts/records get the same contract handle.
//
// What a file may import:
//   ./x.ts, ../x.ts   a file in the same extension folder (or, from a contract, in contracts/)
//   @contracts/name   a contract: contracts/name/index.ts
//   @pip/kernel, zod, react, react/jsx-runtime, react-dom/client   the kernel's shared modules
// Anything else is a problem for that extension alone; the others still load.
import type { Compiled } from './compile.ts';
import type { Candidate, Refused } from './resolve.ts';
import type { KernelKeep } from './secrets.ts';

/** A commit's files under extensions/ and contracts/, by path, with each one's blob sha. */
export interface Tree {
  commit: string;
  files: Map<string, string>;
}

export interface LoaderDeps {
  /** A file's text at the tree's commit. */
  read: (path: string, sha: string) => Promise<string>;
  /** Compiled output by blob sha; absent in tests. */
  keep?: KernelKeep;
  /** The kernel's shared modules, by specifier: every extension gets these same instances. */
  shared: Record<string, object>;
  /** A URL a module can be imported from: a blob: URL in the browser. */
  url: (code: string) => string;
  load: (url: string) => Promise<Record<string, unknown>>;
}

export interface Loaded {
  candidates: Candidate[];
  refused: Refused[];
  /** How the time went, for the startup budget (ARCHITECTURE.md, open questions). */
  stats: { files: number; compiled: number; compileMs: number; totalMs: number };
}

/** Bump when the output changes for the same input, so the cache isn't reused across compilers. */
export const COMPILER = 'sucrase-1';
const SHARED = Symbol.for('pip.shared');
const EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

/** Every folder in extensions/ with an index.ts or index.tsx, by id. */
export function extensionsIn(tree: Tree): Map<string, string> {
  const found = new Map<string, string>();
  for (const path of tree.files.keys()) {
    const m = /^extensions\/([^/]+)\/index\.tsx?$/.exec(path);
    if (m && !found.has(m[1])) found.set(m[1], path);
  }
  return found;
}

export async function load(
  tree: Tree,
  deps: LoaderDeps,
  skip = new Set<string>(),
): Promise<Loaded> {
  const t0 = performance.now();
  const stats = { files: 0, compiled: 0, compileMs: 0, totalMs: 0 };
  (globalThis as Record<symbol, unknown>)[SHARED] = deps.shared;

  const urls = new Map<string, Promise<string>>();
  const shim = (spec: string) => {
    const ns = deps.shared[spec] as Record<string, unknown>;
    const names = Object.keys(ns).filter((k) => k !== 'default');
    const m = `globalThis[Symbol.for('pip.shared')][${JSON.stringify(spec)}]`;
    return deps.url(
      [
        `const m = ${m};`,
        ...names.map((k, i) => `const _${i} = m[${JSON.stringify(k)}];`),
        `export default ('default' in m ? m.default : m);`,
        `export { ${names.map((k, i) => `_${i} as ${JSON.stringify(k)}`).join(', ')} };`,
      ].join('\n'),
    );
  };

  const compiled = async (path: string): Promise<Compiled> => {
    const sha = tree.files.get(path)!;
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
  };

  const resolveSpec = (from: string, spec: string): string => {
    if (spec in deps.shared) return `shared:${spec}`;
    let target: string;
    if (spec.startsWith('@contracts/')) {
      const rest = spec.slice('@contracts/'.length);
      target = `contracts/${rest.includes('/') ? rest : `${rest}/index.ts`}`;
    } else if (spec.startsWith('./') || spec.startsWith('../')) {
      target = join(from, spec);
      const scope = from.startsWith('contracts/')
        ? 'contracts/'
        : `${from.split('/', 2).join('/')}/`;
      if (!target.startsWith(scope))
        throw new Error(`${from}: "${spec}" is outside ${scope} (use @contracts/… for a contract)`);
    } else
      throw new Error(
        `${from}: "${spec}" is not available; shared modules are ${Object.keys(deps.shared).join(', ')}`,
      );
    const found = EXTS.map((e) => target + e).find((p) => tree.files.has(p));
    if (!found) throw new Error(`${from}: "${spec}" not found at this commit`);
    return found;
  };

  const link = (path: string, stack: string[]): Promise<string> => {
    if (path.startsWith('shared:')) {
      const spec = path.slice('shared:'.length);
      if (!urls.has(path)) urls.set(path, Promise.resolve(shim(spec)));
      return urls.get(path)!;
    }
    if (stack.includes(path))
      return Promise.reject(new Error(`an import cycle: ${[...stack, path].join(' → ')}`));
    if (!urls.has(path))
      urls.set(
        path,
        (async () => {
          stats.files++;
          const { code, imports } = await compiled(path);
          const targets = await Promise.all(
            imports.map((i) => link(resolveSpec(path, i.spec), [...stack, path])),
          );
          // Splice from the end, so earlier offsets stay valid.
          let out = code;
          for (let k = imports.length - 1; k >= 0; k--) {
            const { start, end, quoted } = imports[k];
            out =
              out.slice(0, start) +
              (quoted ? JSON.stringify(targets[k]) : targets[k]) +
              out.slice(end);
          }
          return deps.url(`${out}\n//# sourceURL=pip:///${tree.commit.slice(0, 7)}/${path}`);
        })(),
      );
    return urls.get(path)!;
  };

  const candidates: Candidate[] = [];
  const refused: Refused[] = [];
  await Promise.all(
    [...extensionsIn(tree)]
      .filter(([id]) => !skip.has(id))
      .map(async ([id, entry]) => {
        try {
          const mod = await deps.load(await link(entry, []));
          candidates.push({ origin: `extensions/${id}`, ext: mod.default });
        } catch (e) {
          refused.push({ id, problems: [(e as Error).message] });
        }
      }),
  );
  // Ids sort the result, so the order doesn't depend on which compiled first.
  candidates.sort((a, b) => a.origin.localeCompare(b.origin));
  stats.totalMs = performance.now() - t0;
  return { candidates, refused, stats };
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
