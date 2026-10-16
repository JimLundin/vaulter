import type { Plugin } from 'vite';

export function usesDynamicCode(value: unknown, parent?: Record<string, unknown>): boolean {
  if (!value || typeof value !== 'object') return false;
  const node = value as Record<string, unknown>;
  if (node.type === 'Identifier' && ['eval', 'Function'].includes(String(node.name))) {
    // Type checks inspect the constructor without executing source text.
    if (
      !(
        (parent?.type === 'BinaryExpression' &&
          parent.operator === 'instanceof' &&
          parent.right === value) ||
        (node.name === 'Function' &&
          parent?.type === 'MemberExpression' &&
          parent.object === value &&
          !parent.computed &&
          (parent.property as Record<string, unknown>).name === 'prototype')
      )
    )
      return true;
  }
  return Object.values(node).some((child) =>
    Array.isArray(child)
      ? child.some((item) => usesDynamicCode(item, node))
      : usesDynamicCode(child, node),
  );
}

/** Browser dependencies use interpreters and module imports instead of evaluating source text. */
export function noEval(): Plugin {
  return {
    name: 'no-eval',
    enforce: 'pre',
    config() {
      return { optimizeDeps: { rolldownOptions: { plugins: [noEval()] } } };
    },
    transform(source, id) {
      const [path] = id.replaceAll('\\', '/').split('?');
      if (!path?.includes('/node_modules/zod/v4/core/')) return;
      if (path.endsWith('/doc.js')) {
        const compiler = /compile\(\) \{[\s\S]*?\n {4}\}/;
        if (!compiler.test(source)) throw new Error('Zod Doc changed; review the no-eval adapter.');
        return source.replace(
          compiler,
          'compile() { throw new Error("Runtime schema compilation is disabled."); }',
        );
      }
      if (path.endsWith('/compile.js')) {
        const compiler =
          /export function compileFn\(schema, options\) \{[\s\S]*?\n\}\nfunction addConstant/;
        if (!compiler.test(source))
          throw new Error('Zod AOT compiler changed; review the no-eval adapter.');
        return source.replace(
          compiler,
          'export function compileFn() { throw new ZodCompileUnsupportedError("runtime compilation in browser builds"); }\nfunction addConstant',
        );
      }
      if (path.endsWith('/util.js')) {
        const probe = /export const allowsEval = [\s\S]*?cached\(\(\) => \{[\s\S]*?\n\}\);/;
        if (!probe.test(source))
          throw new Error('Zod eval probe changed; review the no-eval adapter.');
        return source.replace(probe, 'export const allowsEval = cached(() => false);');
      }
      if (path.endsWith('/schemas.js')) {
        const flag = 'const jit = !core.globalConfig.jitless;';
        if (!source.includes(flag))
          throw new Error('Zod compiler changed; review the no-eval adapter.');
        return source.replace(flag, 'const jit = false;');
      }
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk' && usesDynamicCode(this.parse(output.code)))
          this.error(`Dynamic code evaluation remains in ${output.fileName}.`);
        if (output.type === 'asset' && output.fileName.endsWith('.js')) {
          const source =
            typeof output.source === 'string'
              ? output.source
              : new TextDecoder().decode(output.source);
          if (usesDynamicCode(this.parse(source)))
            this.error(`Dynamic code evaluation remains in ${output.fileName}.`);
        }
      }
    },
  };
}
