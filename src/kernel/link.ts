// Linking a plan: each module becomes a module URL (blob: in the browser), bottom-up, so every import
// points at one that already exists. Shared modules are the kernel's own copies, one for everyone.
import type { Plan } from './loader.ts';

const SHARED = Symbol.for('vaulter.shared');

export function linker(url: (code: string) => string, shared: Record<string, object>) {
  (globalThis as Record<symbol, unknown>)[SHARED] = shared;
  const urls = new Map<string, string>();
  /** Each linked module's URL → its path, to tell from a stack whose code threw. */
  const paths = new Map<string, string>();

  const shim = (spec: string) => {
    const key = `shared:${spec}`;
    let u = urls.get(key);
    if (!u) {
      const ns = shared[spec] as Record<string, unknown> | undefined;
      if (!ns) throw new Error(`the kernel has no shared module "${spec}"`);
      const names = Object.keys(ns).filter((k) => k !== 'default');
      const m = `globalThis[Symbol.for('vaulter.shared')][${JSON.stringify(spec)}]`;
      u = url(
        [
          `const m = ${m};`,
          ...names.map((k, i) => `const _${i} = m[${JSON.stringify(k)}];`),
          `export default ('default' in m ? m.default : m);`,
          `export { ${names.map((k, i) => `_${i} as ${JSON.stringify(k)}`).join(', ')} };`,
        ].join('\n'),
      );
      urls.set(key, u);
    }
    return u;
  };

  /** The URL of the plan's entry module. Modules are kept by path and sha, so two plans from the
   * same commit share them, and a changed file is a new module. */
  function link(plan: Plan): string {
    const visit = (path: string): string => {
      const key = `${plan.shas[path]}:${path}`;
      const known = urls.get(key);
      if (known) return known;
      const m = plan.modules[path];
      if (!m) throw new Error(`${path} is not in the plan`);
      const targets = m.imports.map((i) =>
        i.target.startsWith('shared:') ? shim(i.target.slice('shared:'.length)) : visit(i.target),
      );
      let out = m.code;
      for (let k = m.imports.length - 1; k >= 0; k--) {
        const { start, end, quoted } = m.imports[k];
        out =
          out.slice(0, start) + (quoted ? JSON.stringify(targets[k]) : targets[k]) + out.slice(end);
      }
      const source = `vaulter:///${plan.commit.slice(0, 7)}/${path}`;
      const u = url(`${out}\n//# sourceURL=${source}`);
      urls.set(key, u);
      paths.set(u, path);
      paths.set(source, path);
      return u;
    };
    return visit(plan.entry);
  }

  /** The extension whose module comes first in `stack`, by the source URL of each module linked here,
   * or its module URL where a runtime keeps that in stacks instead. */
  const extensionAt = (stack: string): string | undefined => {
    let first: { at: number; path: string } | undefined;
    for (const [u, path] of paths) {
      const at = stack.indexOf(u);
      if (at >= 0 && (!first || at < first.at)) first = { at, path };
    }
    return first && /^extensions\/([^/]+)\//.exec(first.path)?.[1];
  };

  return { link, extensionAt };
}
