import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { API } from 'typescript/unstable/sync';
import { expect, test } from 'vitest';
import { compositions } from '../app/ui/kit/composition.ts';
import { checkCompositions, type CompositionRoot } from './composition.ts';

// CI and source-project fixtures use the same composition-policy interface.
test('Agent, Settings and their shared menu use only documented public building blocks', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const api = new API({ cwd: root });
  const snapshot = api.updateSnapshot({ openProjects: [resolve(root, 'tsconfig.json')] });
  try {
    const result = checkCompositions(snapshot.getProjects()[0]!, {
      publicKit: 'app/ui/kit/index.ts',
      roots: compositions.map((composition) => ({
        source: `app/ui/kit/${composition.source}`,
        primitives: composition.primitives,
      })),
    });
    expect(result.violations).toEqual([]);
  } finally {
    snapshot.dispose();
    api.close();
  }
});

function checkFixture(files: Record<string, string>, roots: readonly CompositionRoot[]) {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-composition-policy-'));
  const api = new API({ cwd: root });
  try {
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'preserve',
          paths: { '@/*': ['./kit/*'] },
        },
        include: ['kit'],
      }),
    );
    const sources = {
      'kit/index.ts': "export { Block } from './block.tsx';",
      'kit/block.tsx': 'export function Block() { return <div className="primitive" />; }',
      ...files,
    };
    for (const [source, text] of Object.entries(sources)) {
      const filename = join(root, source);
      mkdirSync(resolve(filename, '..'), { recursive: true });
      writeFileSync(filename, text);
    }
    const snapshot = api.updateSnapshot({ openProjects: [join(root, 'tsconfig.json')] });
    try {
      return checkCompositions(snapshot.getProjects()[0]!, {
        publicKit: 'kit/index.ts',
        roots,
      });
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
    rmSync(root, { recursive: true, force: true });
  }
}

test('equivalent inline and private helpers use the same building blocks without public exports', () => {
  const result = checkFixture(
    {
      'kit/inline.tsx': `import { Block } from './index.ts';
function Helper() { return <Block />; }
export function Inline() { return <Helper />; }`,
      'kit/private.tsx': `import { Block } from './index.ts';
export function Helper() { return <Block />; }`,
      'kit/extracted.tsx': `import { Helper } from './private.tsx';
export function Extracted() { return <Helper />; }`,
    },
    [
      { source: 'kit/inline.tsx', primitives: ['Block'] },
      { source: 'kit/extracted.tsx', primitives: ['Block'] },
    ],
  );
  expect(result).toEqual({
    violations: [],
    usages: [
      { source: 'kit/inline.tsx', primitives: ['Block'] },
      { source: 'kit/extracted.tsx', primitives: ['Block'] },
    ],
  });
});

test('presentation returned by a called private helper cannot hide raw DOM', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { render } from './private.tsx';
export function Composition() { return render(); }`,
      'kit/private.tsx': `export function render() {
  return <section />;
}`,
    },
    [{ source: 'kit/root.tsx', primitives: [] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/private.tsx', line: 2, column: 10, reason: 'intrinsic <section>' },
  ]);
});

test('nested render helpers reached through aliases and re-exports report their building blocks', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { render as content } from '@/bridge.ts';
export function Composition() { return content(); }`,
      'kit/bridge.ts': "export { render } from './private.tsx';",
      'kit/private.tsx': `import { nested } from './nested.tsx';
export function render() { return nested(); }`,
      'kit/nested.tsx': `import { Block as Approved } from './index.ts';
export function nested() { return <Approved />; }`,
    },
    [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  );
  expect(result).toEqual({
    violations: [],
    usages: [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  });
});

test('a private object with a Provider property cannot impersonate a state-only context', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { Helper } from './private.tsx';
export function Composition() { return <Helper />; }`,
      'kit/private.tsx': `import { Button } from 'radix-ui';
const State = { Provider: Button };
export function Helper() { return <State.Provider />; }`,
      'node_modules/radix-ui/index.d.ts': 'export declare function Button(): unknown;',
    },
    [{ source: 'kit/root.tsx', primitives: [] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/private.tsx', line: 3, column: 35, reason: 'uncatalogued <State.Provider>' },
  ]);
});

test('styling imported into a private helper through spread props is rejected at its declaration', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { Helper } from './private.tsx';
export function Composition() { return <Helper />; }`,
      'kit/private.tsx': `import { Block } from './index.ts';
import { props } from './props.ts';
export function Helper() { return <Block {...props} />; }`,
      'kit/props.ts': `export const props = {
  className: 'custom',
};`,
    },
    [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/props.ts', line: 1, column: 22, reason: 'custom presentation spread' },
  ]);
});

test('called private render helpers cannot switch raw DOM to intrinsic factories', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { render } from './private.ts';
export function Composition() { return render(); }`,
      'kit/private.ts': `import { createElement as element } from 'react';
export function render() { return element('section'); }`,
      'node_modules/react/index.d.ts':
        'export declare function createElement(tag: string): unknown;',
    },
    [{ source: 'kit/root.tsx', primitives: [] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/private.ts', line: 2, column: 35, reason: 'intrinsic factory' },
  ]);
});

test('private component aliases cannot hide unapproved external interaction controls', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { Helper } from './private.tsx';
export function Composition() { return <Helper />; }`,
      'kit/private.tsx': `import { Button } from 'radix-ui';
const Control = Button;
export function Helper() { return <Control />; }`,
      'node_modules/radix-ui/index.d.ts': 'export declare function Button(): unknown;',
    },
    [{ source: 'kit/root.tsx', primitives: [] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/private.tsx', line: 3, column: 35, reason: 'uncatalogued <Control>' },
  ]);
});

test('approved building blocks used by private element factories remain documented stopping points', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { render } from './private.ts';
export function Composition() { return render(); }`,
      'kit/private.ts': `import { createElement } from 'react';
import { Block } from './index.ts';
export function render() { return createElement(Block); }`,
      'node_modules/react/index.d.ts':
        'export declare function createElement(component: unknown): unknown;',
    },
    [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  );
  expect(result).toEqual({
    violations: [],
    usages: [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  });
});

test('a private helper cannot hide styling passed directly from an imported prop value', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { Helper } from './private.tsx';
export function Composition() { return <Helper />; }`,
      'kit/private.tsx': `import { Block } from './index.ts';
import { props } from './props.ts';
export function Helper() { return <Block {...props} />; }`,
      'kit/props.ts': `import { base } from './base.ts';
export const props = base;`,
      'kit/base.ts': 'export const base = { style: { color: "red" } };',
    },
    [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/base.ts', line: 1, column: 21, reason: 'custom presentation spread' },
  ]);
});

test('resolved private context providers carry state without becoming public components', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { Helper } from './private.tsx';
export function Composition() { return <Helper />; }`,
      'kit/private.tsx': `import { Shared as State } from './bridge.ts';
import { Block } from './index.ts';
export const Helper = () => <State.Provider value={{ open: true }}><Block /></State.Provider>;`,
      'kit/bridge.ts': "export { State as Shared } from './state.ts';",
      'kit/state.ts': `import { createContext as context } from 'react';
export const State = context({ open: false });`,
      'node_modules/react/index.d.ts':
        'export declare function createContext(value: unknown): { Provider: unknown };',
    },
    [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  );
  expect(result).toEqual({
    violations: [],
    usages: [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  });
});

test('cycles and shared helpers terminate with deduplicated diagnostics and per-root usage', () => {
  const result = checkFixture(
    {
      'kit/first.tsx': `import { A } from './a.tsx';
export function First() { return <><A /><A /></>; }`,
      'kit/second.tsx': `import { A } from './a.tsx';
export function Second() { return <A />; }`,
      'kit/a.tsx': `import { B } from './b.tsx';
import { Block } from './index.ts';
export function A() { return <Block><B /></Block>; }`,
      'kit/b.tsx': `import { A } from './a.tsx';
export function B() { return <><A /><section /></>; }`,
    },
    [
      { source: 'kit/first.tsx', primitives: ['Block'] },
      { source: 'kit/second.tsx', primitives: ['Block'] },
    ],
  );
  expect(result).toEqual({
    violations: [{ source: 'kit/b.tsx', line: 2, column: 37, reason: 'intrinsic <section>' }],
    usages: [
      { source: 'kit/first.tsx', primitives: ['Block'] },
      { source: 'kit/second.tsx', primitives: ['Block'] },
    ],
  });
});

test('private extraction preserves direct styling diagnostics at the offending helper', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { Helper } from './private.tsx';
export function Composition() { return <Helper />; }`,
      'kit/private.tsx': `import { Block } from './index.ts';
export function Helper() { return <Block className="custom" />; }`,
    },
    [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/private.tsx', line: 2, column: 42, reason: 'custom presentation' },
  ]);
});

test('unresolved presentation imports fail at their reached use instead of silently passing', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { Helper } from './private.tsx';
export function Composition() { return <Helper />; }`,
      'kit/private.tsx': `import { Missing } from './missing.tsx';
export function Helper() {
  return <Missing />;
}`,
    },
    [{ source: 'kit/root.tsx', primitives: [] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/private.tsx', line: 3, column: 10, reason: 'uncatalogued <Missing>' },
  ]);
});

test('unstyled public exports and their wrapped primitive declarations remain approved stopping points', () => {
  const result = checkFixture(
    {
      'kit/index.ts': `import { unstyled as withoutStyle } from './lib/unstyled.ts';
import { Part } from './part.tsx';
export const Block = withoutStyle(Part);`,
      'kit/lib/unstyled.ts': 'export function unstyled(component: unknown) { return component; }',
      'kit/part.tsx': `export function Part() { return <button style={{ color: 'red' }} />; }`,
      'kit/root.tsx': `import { Helper } from './private.tsx';
export function Composition() { return <Helper />; }`,
      'kit/private.tsx': `import { Part as Approved } from './part.tsx';
export function Helper() { return <Approved />; }`,
    },
    [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  );
  expect(result).toEqual({
    violations: [],
    usages: [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  });
});

test('only configured roots and their reached declarations are checked while whole-root rules remain', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { Helper } from './private.tsx';
export function Composition() { return <Helper />; }
function UnusedRootHelper() {
  return <section />;
}`,
      'kit/private.tsx': `import { Block } from './index.ts';
export function Helper() { return <Block />; }
export function UnreachedPrivateHelper() { return <article />; }`,
      'kit/unconfigured.tsx': 'export function Other() { return <aside />; }',
    },
    [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  );
  expect(result).toEqual({
    violations: [{ source: 'kit/root.tsx', line: 4, column: 10, reason: 'intrinsic <section>' }],
    usages: [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  });
});

test('declared building-block metadata must include usage through private helpers', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { Helper } from './private.tsx';
export function Composition() { return <Helper />; }`,
      'kit/private.tsx': `import { Block } from './index.ts';
export function Helper() { return <Block />; }`,
    },
    [{ source: 'kit/root.tsx', primitives: [] }],
  );
  expect(result).toEqual({
    violations: [
      {
        source: 'kit/root.tsx',
        line: 1,
        column: 1,
        reason: 'building-block metadata: expected ; used Block',
      },
    ],
    usages: [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  });
});

test('a private helper sharing a primitive name cannot become an approved stopping point', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { Helper } from './block.tsx';
export function Composition() { return <Helper />; }`,
      'kit/block.tsx': `export function Block() { return <div />; }
export function Helper() {
  function Block() { return <section />; }
  return <Block />;
}`,
    },
    [{ source: 'kit/root.tsx', primitives: [] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/block.tsx', line: 3, column: 29, reason: 'intrinsic <section>' },
  ]);
});

test('presentation factories check imported prop objects for styling', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { render } from './private.ts';
export function Composition() { return render(); }`,
      'kit/private.ts': `import { createElement } from 'react';
import { Block } from './index.ts';
import { props } from './props.ts';
export function render() { return createElement(Block, props); }`,
      'kit/props.ts': 'export const props = { className: "custom" };',
      'node_modules/react/index.d.ts':
        'export declare function createElement(component: unknown, props: unknown): unknown;',
    },
    [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/props.ts', line: 1, column: 22, reason: 'custom presentation spread' },
  ]);
});

test('styling shorthand properties in private spread props remain custom presentation', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { Helper } from './private.tsx';
export function Composition() { return <Helper />; }`,
      'kit/private.tsx': `import { Block } from './index.ts';
const className = 'custom';
const props = { className };
export function Helper() { return <Block {...props} />; }`,
    },
    [{ source: 'kit/root.tsx', primitives: ['Block'] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/private.tsx', line: 3, column: 15, reason: 'custom presentation spread' },
  ]);
});

test('resolved external controls remain unapproved even when their source lives below the kit directory', () => {
  const result = checkFixture(
    {
      'kit/root.tsx': `import { Helper } from './private.tsx';
export function Composition() { return <Helper />; }`,
      'kit/private.tsx': `import { Control } from 'external';
export function Helper() { return <Control />; }`,
      'kit/node_modules/external/package.json': '{"name":"external","types":"index.tsx"}',
      'kit/node_modules/external/index.tsx': 'export function Control() { return null; }',
    },
    [{ source: 'kit/root.tsx', primitives: [] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/private.tsx', line: 2, column: 35, reason: 'uncatalogued <Control>' },
  ]);
});

test('an unresolved wrapped primitive cannot approve unrelated unresolved presentation targets', () => {
  const result = checkFixture(
    {
      'kit/index.ts': `import { unstyled } from './lib/unstyled.ts';
export const Block = unstyled(MissingPart);`,
      'kit/lib/unstyled.ts': 'export function unstyled(component: unknown) { return component; }',
      'kit/root.tsx': `export function Composition() {
  return <Missing />;
}`,
    },
    [{ source: 'kit/root.tsx', primitives: [] }],
  );
  expect(result.violations).toEqual([
    { source: 'kit/root.tsx', line: 2, column: 10, reason: 'uncatalogued <Missing>' },
  ]);
});

test('inline and extracted presentation values retain equivalent raw DOM diagnostics', () => {
  const result = checkFixture(
    {
      'kit/inline.tsx': `const content = <section />;
function Helper() { return content; }
export function Inline() { return <Helper />; }`,
      'kit/value.tsx': 'export const content = <section />;',
      'kit/private.tsx': `import { content } from './value.tsx';
export function Helper() { return content; }`,
      'kit/extracted.tsx': `import { Helper } from './private.tsx';
export function Extracted() { return <Helper />; }`,
    },
    [
      { source: 'kit/inline.tsx', primitives: [] },
      { source: 'kit/extracted.tsx', primitives: [] },
    ],
  );
  expect(result.violations).toEqual(
    expect.arrayContaining([
      { source: 'kit/inline.tsx', line: 1, column: 17, reason: 'intrinsic <section>' },
      { source: 'kit/value.tsx', line: 1, column: 24, reason: 'intrinsic <section>' },
    ]),
  );
  expect(result.violations).toHaveLength(2);
});

test('aliased private presentation values preserve building-block usage in concise helpers', () => {
  const result = checkFixture(
    {
      'kit/inline.tsx': `import { Block } from './index.ts';
const content = <Block />;
const Helper = () => content;
export function Inline() { return <Helper />; }`,
      'kit/value.tsx': `import { Block } from './index.ts';
const original = <Block />;
export const content = original;`,
      'kit/private.tsx': `import { content } from './value.tsx';
export const Helper = () => content;`,
      'kit/extracted.tsx': `import { Helper } from './private.tsx';
export function Extracted() { return <Helper />; }`,
    },
    [
      { source: 'kit/inline.tsx', primitives: ['Block'] },
      { source: 'kit/extracted.tsx', primitives: ['Block'] },
    ],
  );
  expect(result).toEqual({
    violations: [],
    usages: [
      { source: 'kit/inline.tsx', primitives: ['Block'] },
      { source: 'kit/extracted.tsx', primitives: ['Block'] },
    ],
  });
});

test('called private aliases cannot hide presentation returned by their target', () => {
  const result = checkFixture(
    {
      'kit/inline.tsx': `function render() { return <section />; }
const alias = render;
export function Inline() { return alias(); }`,
      'kit/private.tsx': `function render() {
  return <section />;
}
export const alias = render;`,
      'kit/extracted.tsx': `import { alias } from './private.tsx';
export function Extracted() { return alias(); }`,
    },
    [
      { source: 'kit/inline.tsx', primitives: [] },
      { source: 'kit/extracted.tsx', primitives: [] },
    ],
  );
  expect(result.violations).toEqual(
    expect.arrayContaining([
      { source: 'kit/inline.tsx', line: 1, column: 28, reason: 'intrinsic <section>' },
      { source: 'kit/private.tsx', line: 2, column: 10, reason: 'intrinsic <section>' },
    ]),
  );
  expect(result.violations).toHaveLength(2);
});

test('inline and extracted prop-producing helpers report the same styling violation', () => {
  const result = checkFixture(
    {
      'kit/inline.tsx': `import { Block } from './index.ts';
function getProps() { return { style: { color: 'red' } }; }
export function Inline() { return <Block {...getProps()} />; }`,
      'kit/props.ts': `export function getProps() {
  return { style: { color: 'red' } };
}`,
      'kit/private.tsx': `import { Block } from './index.ts';
import { getProps } from './props.ts';
export function Helper() { return <Block {...getProps()} />; }`,
      'kit/extracted.tsx': `import { Helper } from './private.tsx';
export function Extracted() { return <Helper />; }`,
    },
    [
      { source: 'kit/inline.tsx', primitives: ['Block'] },
      { source: 'kit/extracted.tsx', primitives: ['Block'] },
    ],
  );
  expect(result).toEqual({
    violations: expect.arrayContaining([
      { source: 'kit/inline.tsx', line: 2, column: 30, reason: 'custom presentation spread' },
      { source: 'kit/props.ts', line: 2, column: 10, reason: 'custom presentation spread' },
    ]),
    usages: [
      { source: 'kit/inline.tsx', primitives: ['Block'] },
      { source: 'kit/extracted.tsx', primitives: ['Block'] },
    ],
  });
  expect(result.violations).toHaveLength(2);
});
