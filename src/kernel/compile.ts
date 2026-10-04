// Compiling one source file in the browser: Sucrase strips the types and turns JSX into react/jsx-runtime
// calls, and the lexer finds every import so the linker can point it at a module URL. The output depends
// only on the file's text, so it is cached by blob sha: a new commit recompiles only what changed.
import { init, parse } from 'es-module-lexer/js';
import { transform } from 'sucrase';

export interface Compiled {
  code: string;
  /** Each import's specifier and where it sits in `code`; `quoted` when the range includes the quotes
   * (a dynamic import's literal). */
  imports: { spec: string; start: number; end: number; quoted: boolean }[];
}

export async function compile(path: string, source: string): Promise<Compiled> {
  const tsx = path.endsWith('.tsx');
  const { code } = transform(source, {
    transforms: tsx ? ['typescript', 'jsx'] : ['typescript'],
    jsxRuntime: 'automatic',
    production: true,
    // As tsconfig's verbatimModuleSyntax: an import stays unless it says `import type`.
    keepUnusedImports: true,
    filePath: path,
  });
  await init;
  const [found] = parse(code, path);
  const imports: Compiled['imports'] = [];
  for (const i of found) {
    if (i.type === 'import-meta') continue;
    if (i.specifier === undefined) throw new Error(`${path}: an import() needs a string literal`);
    imports.push({ spec: i.specifier, start: i.start, end: i.end, quoted: i.type === 'dynamic' });
  }
  return { code, imports };
}
