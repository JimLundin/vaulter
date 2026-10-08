import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { checkLayout, importProblem } from './layout.ts';

test('optional workflows are composed only by Product and use the public kit', () => {
  expect(checkLayout(fileURLToPath(new URL('..', import.meta.url)))).toEqual([]);
});
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
