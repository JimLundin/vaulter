import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { checkLayout, importProblem } from './layout.ts';

test('optional workflows are composed only by Product and use the public kit', () => {
  expect(checkLayout(fileURLToPath(new URL('..', import.meta.url)))).toEqual([]);
}, 15_000);
test('the dependency policy rejects cross-workflow imports and private kit access', () => {
  expect(importProblem('app/workflows/chat/Chat.tsx', 'app/workflows/history/index.tsx')).toContain(
    'compose',
  );
  expect(importProblem('app/vault/index.ts', 'app/workflows/rename-note/index.ts')).toContain(
    'optional workflow',
  );
  expect(importProblem('app/ui/Frame.tsx', 'app/workflows/chat/index.tsx')).toContain(
    'optional workflow',
  );
  expect(importProblem('app/product.tsx', 'app/workflows/history/index.tsx')).toBeNull();
  expect(
    importProblem('app/workflows/history/index.tsx', 'app/workflows/history/HistoryPage.tsx'),
  ).toBeNull();
  expect(importProblem('app/workflows/chat/Chat.tsx', 'app/ui/kit/parts/button.tsx')).toContain(
    'private kit',
  );
});

test('compiler-resolved aliases, dynamic imports and re-exports cannot hide a workflow dependency', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-import-policy-'));
  try {
    mkdirSync(join(root, 'app/workflows/first'), { recursive: true });
    mkdirSync(join(root, 'app/workflows/second'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          paths: { '@/*': ['./app/*'] },
        },
        include: ['app'],
      }),
    );
    writeFileSync(join(root, 'app/workflows/second/index.ts'), 'export const value = 1;');
    const imports = [
      "import { value } from '@/workflows/second/index.ts'; export { value };",
      "export { value } from '@/workflows/second/index.ts';",
      "export const load = () => import('@/workflows/second/index.ts');",
    ];
    for (const [i, source] of imports.entries()) {
      writeFileSync(join(root, `app/workflows/first/case${i}.ts`), source);
    }
    const problems = checkLayout(root);
    expect(problems).toHaveLength(3);
    expect(problems.every((problem) => problem.includes('optional workflow second'))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('workflow screens cannot choose a device layout or query a viewport', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-presentation-policy-'));
  try {
    mkdirSync(join(root, 'app/workflows/example'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/workflows/example/view.ts'),
      "import { useLayout as size } from 'kit'; export const layout = size(); export const wide = window.matchMedia('(min-width: 1000px)');",
    );
    expect(checkLayout(root)).toEqual([
      'app/workflows/example/view.ts: size-dependent presentation belongs in the kit',
      'app/workflows/example/view.ts: viewport queries belong in the kit',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Base UI presentation dependencies stay inside the kit', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-base-ui-policy-'));
  try {
    mkdirSync(join(root, 'app/ui/kit'), { recursive: true });
    mkdirSync(join(root, 'app/workflows/example'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/ui/kit/drawer.ts'),
      "export { Drawer } from '@base-ui/react/drawer';",
    );
    writeFileSync(
      join(root, 'app/workflows/example/view.ts'),
      "import { Drawer } from '@base-ui/react/drawer'; export const view = Drawer;",
    );
    expect(checkLayout(root)).toEqual([
      'app/workflows/example/view.ts: presentation dependencies belong behind app/ui/kit/index.ts',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Product, shared views and features must compose the kit, including aliased factories and spread props', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-kit-policy-'));
  try {
    mkdirSync(join(root, 'app/ui'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/factory.ts'),
      'export function createElement(tag: string) { return tag; }',
    );
    writeFileSync(
      join(root, 'app/product.tsx'),
      `import { createElement as element } from './factory.ts';
      const props = { className: 'custom' }; export const view = <div {...props} style={{color:'red'}} />;
      export const hidden = element('section');`,
    );
    writeFileSync(
      join(root, 'app/ui/custom.tsx'),
      "import { Button } from 'radix-ui'; import './custom.css'; export const view = <button>Custom</button>;",
    );
    const problems = checkLayout(root);
    expect(problems).toEqual(
      expect.arrayContaining([
        'app/product.tsx: <div> must be a public kit component',
        'app/product.tsx: app views must compose the public kit instead of styling elements',
        'app/product.tsx: presentation props belong in the kit or content renderer',
        'app/product.tsx: intrinsic element factories belong in the kit or content renderer',
        'app/ui/custom.tsx: <button> must be a public kit component',
        'app/ui/custom.tsx: presentation dependencies belong behind app/ui/kit/index.ts',
        'app/ui/custom.tsx: app styles belong in the kit or content renderer',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('outside the kit, only Product reads the size class', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-size-class-policy-'));
  try {
    mkdirSync(join(root, 'app/ui'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/ui/Frame.ts'),
      "import { useLayout } from 'kit'; export const layout = useLayout();",
    );
    writeFileSync(
      join(root, 'app/product.tsx'),
      "import { useLayout } from 'kit'; export const layout = useLayout();",
    );
    expect(checkLayout(root)).toEqual([
      'app/ui/Frame.ts: size-dependent presentation belongs in the kit',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('shared row presentation cannot interpret Vault records through aliases, re-exports or dynamic imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-record-presentation-policy-'));
  try {
    mkdirSync(join(root, 'app/ui/kit'), { recursive: true });
    mkdirSync(join(root, 'app/vault/nodes'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          paths: { '@/*': ['./app/*'] },
        },
        include: ['app'],
      }),
    );
    writeFileSync(join(root, 'app/vault/nodes/model.ts'), 'export const transaction = 1;');
    const imports = [
      "import { transaction } from '@/vault/nodes/model.ts'; export { transaction };",
      "export { transaction } from '@/vault/nodes/model.ts';",
      "export const load = () => import('@/vault/nodes/model.ts');",
    ];
    for (const [index, source] of imports.entries())
      writeFileSync(join(root, `app/ui/kit/row${index}.ts`), source);
    const problems = checkLayout(root);
    expect(problems).toHaveLength(3);
    expect(problems.every((problem) => problem.includes('record interpretation'))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('shared Search helpers cannot choose viewport presentation', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-search-presentation-policy-'));
  try {
    mkdirSync(join(root, 'app/ui/search'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/ui/search/presentation.ts'),
      "export const narrow = window.matchMedia('(max-width: 767px)');",
    );
    expect(checkLayout(root)).toEqual([
      'app/ui/search/presentation.ts: viewport queries belong in the kit',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('kit mechanics cannot import Search task rendering through aliases or re-exports', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-search-ownership-policy-'));
  try {
    mkdirSync(join(root, 'app/ui/kit'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          paths: { '@/*': ['./app/*'] },
        },
        include: ['app'],
      }),
    );
    writeFileSync(join(root, 'app/ui/Search.ts'), 'export const SearchView = 1;');
    for (const [i, source] of [
      "import { SearchView } from '@/ui/Search.ts'; export { SearchView };",
      "export { SearchView } from '@/ui/Search.ts';",
      "export const load = () => import('@/ui/Search.ts');",
    ].entries()) {
      writeFileSync(join(root, `app/ui/kit/case${i}.ts`), source);
    }
    const problems = checkLayout(root);
    expect(problems).toHaveLength(3);
    expect(problems.every((problem) => problem.includes('task UI belongs outside the kit'))).toBe(
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('supporting-pane callers cannot hide private presentation access behind aliases or helpers', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-pane-policy-'));
  try {
    mkdirSync(join(root, 'app/ui/kit'), { recursive: true });
    mkdirSync(join(root, 'app/workflows/example'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'preserve',
          paths: { '@kit/*': ['./app/ui/kit/*'] },
        },
        include: ['app'],
      }),
    );
    writeFileSync(join(root, 'app/ui/kit/drawer.tsx'), 'export function Drawer() { return null; }');
    writeFileSync(
      join(root, 'app/workflows/example/helper.tsx'),
      `import { Drawer as Pane } from '@kit/drawer.tsx';
const props = { style: { width: 500 } };
export function Helper() { return <Pane {...props} />; }`,
    );
    writeFileSync(
      join(root, 'app/workflows/example/view.tsx'),
      `export { Drawer } from '@kit/drawer.tsx';
export const load = () => import('@kit/drawer.tsx');`,
    );
    expect(checkLayout(root)).toEqual(
      expect.arrayContaining([
        'app/workflows/example/helper.tsx imports a private kit file; use app/ui/kit/index.ts',
        'app/workflows/example/helper.tsx: presentation props belong in the kit or content renderer',
        'app/workflows/example/view.tsx imports a private kit file; use app/ui/kit/index.ts',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Wiki renderers accept semantic content but cannot own application presentation', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-wiki-policy-'));
  try {
    mkdirSync(join(root, 'app/workflows/wiki/rendering'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/workflows/wiki/rendering/content.tsx'),
      'export const content = <section id="claim"><h2>Title</h2><p><strong>Retained</strong> text <a href="#/wiki/page/">Page</a></p><table><tbody><tr><td data-align="right">1</td></tr></tbody></table></section>;',
    );
    expect(checkLayout(root)).toEqual([]);
    writeFileSync(
      join(root, 'app/workflows/wiki/rendering/presentation.tsx'),
      `import { Drawer } from '@base-ui/react/drawer';
      export const card = <div className="overflow-auto"><button>Context</button></div>;
      export const viewport = window.matchMedia('(min-width: 768px)');`,
    );
    const problems = checkLayout(root);
    expect(problems).toEqual(
      expect.arrayContaining([
        'app/workflows/wiki/rendering/presentation.tsx: <div> must be a public kit component',
        'app/workflows/wiki/rendering/presentation.tsx: <button> must be a public kit component',
        'app/workflows/wiki/rendering/presentation.tsx: app views must compose the public kit instead of styling elements',
        'app/workflows/wiki/rendering/presentation.tsx: presentation dependencies belong behind app/ui/kit/index.ts',
        'app/workflows/wiki/rendering/presentation.tsx: viewport queries belong in the kit',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Wiki passage renderers and private helpers cannot own controls, clipping or scroll mechanics', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-passage-policy-'));
  try {
    mkdirSync(join(root, 'app/workflows/wiki/rendering/private'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/workflows/wiki/rendering/references.tsx'),
      'export const passage = <blockquote><strong>Retained</strong> <mark>selected</mark> <a href="#/source/">Source</a></blockquote>;',
    );
    expect(checkLayout(root)).toEqual([]);
    writeFileSync(
      join(root, 'app/workflows/wiki/rendering/references.tsx'),
      `import { hide } from './private/clipping.ts';
      export const passage = <section className="card"><button onClick={hide}>Context</button></section>;`,
    );
    writeFileSync(
      join(root, 'app/workflows/wiki/rendering/private/clipping.ts'),
      'export function hide(node: HTMLElement) { node.scrollTop = 20; node.getBoundingClientRect(); new ResizeObserver(() => {}); }',
    );
    const problems = checkLayout(root);
    expect(problems).toEqual(
      expect.arrayContaining([
        'app/workflows/wiki/rendering/references.tsx: <button> must be a public kit component',
        'app/workflows/wiki/rendering/references.tsx: app views must compose the public kit instead of styling elements',
        'app/workflows/wiki/rendering/private/clipping.ts: passage measurement and scrolling belong in the kit',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
