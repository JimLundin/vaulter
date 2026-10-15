import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { checkLayout, importProblem } from './layout.ts';

test('optional workflows are composed only by Application and use the public kit', () => {
  expect(checkLayout(fileURLToPath(new URL('../../', import.meta.url)))).toEqual([]);
}, 30_000);
test('the dependency policy rejects cross-workflow imports and private kit access', () => {
  expect(
    importProblem('app/workflows/chat/Chat.tsx', 'app/workflows/questions/index.tsx'),
  ).toContain('compose');
  expect(importProblem('app/vault/index.ts', 'app/workflows/questions/index.ts')).toContain(
    'optional workflow',
  );
  expect(importProblem('app/application/Frame.tsx', 'app/workflows/chat/index.tsx')).toContain(
    'optional workflow',
  );
  expect(
    importProblem('app/application/index.tsx', 'app/vault/transactions/history/index.tsx'),
  ).toBeNull();
  expect(
    importProblem('app/workflows/chat/Chat.tsx', 'app/vault/transactions/history/nodes.ts'),
  ).toBeNull();
  expect(
    importProblem(
      'app/vault/transactions/history/index.tsx',
      'app/vault/transactions/history/HistoryPage.tsx',
    ),
  ).toBeNull();
  expect(importProblem('app/workflows/chat/Chat.tsx', 'app/ui/kit/parts/button.tsx')).toContain(
    'private kit',
  );
});

test('application tasks cannot construct raw node adapters', () => {
  const entries = [
    'app/vault/nodes/memory.ts',
    'app/vault/nodes/backend.ts',
    'app/vault/storage/nodes/github.ts',
  ];
  for (const entry of entries) {
    for (const caller of [
      'app/agent/tool-context.ts',
      'app/workflows/questions/actions.ts',
      'app/vault/content/tools.ts',
      'app/application/index.tsx',
    ])
      expect(importProblem(caller, entry)).toContain('Application-supplied TransactionStore');
    for (const caller of [
      'app/main.tsx',
      'app/vault/nodes/memory.ts',
      'app/vault/storage/nodes/github.ts',
      'app/preview/nodes.ts',
      'app/agent/tools.test.ts',
      'app/vault/nodes/fixtures.test-support.ts',
    ])
      if (caller === 'app/vault/nodes/memory.ts' && entry.startsWith('app/vault/storage/'))
        expect(importProblem(caller, entry)).toContain('higher-level');
      else expect(importProblem(caller, entry)).toBeNull();
  }
  expect(
    importProblem('app/agent/new-tool.ts', 'app/vault/nodes/fixtures.test-support.ts'),
  ).toContain('fixtures cannot publish application data');
  expect(
    importProblem('app/agent/new-tool.test.ts', 'app/vault/nodes/fixtures.test-support.ts'),
  ).toBeNull();
  expect(
    importProblem('app/preview/nodes.ts', 'app/vault/nodes/fixtures.test-support.ts'),
  ).toBeNull();
  expect(importProblem('app/agent/new-tool.ts', 'app/preview/nodes.ts')).toContain(
    'fixtures cannot publish application data',
  );
  expect(importProblem('app/agent/new-tool.test.ts', 'app/preview/nodes.ts')).toBeNull();
});

test('raw session hooks remain with Vault assembly and Application through every import form', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-node-session-policy-'));
  try {
    const files = {
      'app/vault/session/session.ts':
        'export function useSession() { return {nodes: {}}; } export type Session = {nodes: unknown};',
      'app/vault/index.ts':
        "import { useSession } from './session/session.ts'; export { useSession as open }; export function useVaultSession() { return useSession(); } export type { Session } from './session/session.ts';",
      'app/application/index.tsx':
        "import { useVaultSession } from '../vault/index.ts'; const session = useVaultSession; export const exposed = session;",
      'app/agent/import.ts':
        "import { open as session } from '@/vault/index.ts'; export { session };",
      'app/agent/value-alias.ts':
        "import { exposed as session } from '@/application/index.tsx'; export { session };",
      'app/agent/export.ts': "export { open } from '@/vault/index.ts';",
      'app/agent/export-all.ts': "export * from '@/vault/index.ts';",
      'app/agent/namespace.ts': "import * as vault from '@/vault/index.ts'; export { vault };",
      'app/agent/export-namespace.ts': "export * as vault from '@/vault/index.ts';",
      'app/agent/dynamic.ts': "export const vault = () => import('@/vault/index.ts');",
      'app/agent/types.ts':
        "import type { Session } from '@/vault/index.ts'; export type State = Session;",
      'app/vault/session/owner.ts':
        "import { useSession } from './session.ts'; export { useSession };",
      'app/agent/session.test.ts':
        "import { useSession } from '@/vault/session/session.ts'; import { useVaultSession } from '@/vault/index.ts'; export { useSession, useVaultSession };",
    };
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'preserve',
          paths: { '@/*': ['./app/*'] },
        },
        include: ['app'],
      }),
    );
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    expect(checkLayout(root).toSorted((a, b) => a.localeCompare(b))).toEqual(
      ['import', 'value-alias', 'export', 'export-all', 'namespace', 'export-namespace', 'dynamic']
        .map(
          (name) =>
            `app/agent/${name}.ts accesses a raw node session; use the Application-supplied TransactionStore`,
        )
        .concat(
          'app/agent/value-alias.ts imports Application composition; dependencies point from Application to module owners',
        )
        .toSorted((a, b) => a.localeCompare(b)),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compiler resolution prevents raw node acceptance hidden by aliases and re-exports', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-node-publication-policy-'));
  try {
    const files = {
      'app/vault/nodes/memory.ts': 'export function memoryNodeBackend() { return {}; }',
      'app/vault/nodes/history.ts':
        'export function accept() {} export function validateRecords() {} export function validateRecordsAsync() {} export class NodeConflict extends Error {} export class NodePublicationRejected extends Error {} export function snapshotOf() {}',
      'app/vault/nodes/public-looking.ts':
        "export { memoryNodeBackend as build } from './memory.ts'; export { accept as publish, validateRecords as load, validateRecordsAsync as loadAsync, NodeConflict, NodePublicationRejected, snapshotOf } from './history.ts';",
      'app/vault/nodes/aliased.ts':
        "import { memoryNodeBackend } from './memory.ts'; const backend = memoryNodeBackend; export const build = backend;",
      'app/workflows/example/value-alias.ts':
        "import { build } from '@/vault/nodes/aliased.ts'; export { build };",
      'app/workflows/example/import.ts':
        "import { build as construct, publish as write, load, loadAsync } from '@/vault/nodes/public-looking.ts'; export { construct, write, load, loadAsync };",
      'app/workflows/example/export.ts':
        "export { build as construct, publish as write } from '@/vault/nodes/public-looking.ts';",
      'app/workflows/example/export-all.ts': "export * from '@/vault/nodes/public-looking.ts';",
      'app/workflows/example/namespace.ts':
        "import * as persistence from '@/vault/nodes/public-looking.ts'; export { persistence };",
      'app/workflows/example/export-namespace.ts':
        "export * as persistence from '@/vault/nodes/public-looking.ts';",
      'app/workflows/example/dynamic.ts':
        "export const persistence = () => import('@/vault/nodes/public-looking.ts');",
      'app/workflows/example/require.ts':
        "export const persistence = require('@/vault/nodes/public-looking.ts');",
      'app/workflows/example/errors-and-reading.ts':
        "import { NodeConflict, NodePublicationRejected, snapshotOf } from '@/vault/nodes/public-looking.ts'; export { NodeConflict, NodePublicationRejected, snapshotOf };",
    };
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
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    expect(checkLayout(root).toSorted((a, b) => a.localeCompare(b))).toEqual(
      ['import', 'export', 'export-all', 'namespace', 'export-namespace', 'dynamic', 'value-alias']
        .map(
          (name) =>
            `app/workflows/example/${name}.ts accesses raw node persistence; use the Application-supplied TransactionStore`,
        )
        .concat(
          'app/workflows/example/require.ts: module loading must resolve through TypeScript so ownership can be checked',
        )
        .toSorted((a, b) => a.localeCompare(b)),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('application writers cannot access raw Node commit through properties, destructuring or aliases', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-node-commit-policy-'));
  try {
    const files = {
      'app/vault/nodes/store.ts':
        'export interface NodeStore { commit(): void; snapshot(): void; } export interface NodeBackend extends NodeStore { close(): void; }',
      'app/vault/nodes/reading.ts':
        "export type { NodeStore as Store, NodeBackend as Backend } from './store.ts';",
      'app/workflows/example/property.ts':
        "import type { Store } from '@/vault/nodes/reading.ts'; export const write = (nodes: Store) => nodes.commit();",
      'app/workflows/example/element.ts':
        "import type { Backend } from '@/vault/nodes/reading.ts'; const method = 'commit'; export const write = (nodes: Backend) => nodes[method]();",
      'app/workflows/example/destructure.ts':
        "import type { Store } from '@/vault/nodes/reading.ts'; declare const nodes: Store; const { commit: publish } = nodes; export const write = publish;",
      'app/workflows/example/alias.ts':
        "import type { Store } from '@/vault/nodes/reading.ts'; declare const nodes: Store; const borrowed = nodes; const publish = borrowed.commit; export const write = publish;",
      'app/workflows/example/read.ts':
        "import type { Store } from '@/vault/nodes/reading.ts'; export const read = (nodes: Store) => nodes.snapshot();",
      'app/workflows/example/legacy.ts':
        'interface Files { commit(): void; } export const save = (files: Files) => files.commit();',
      'app/vault/transactions/lifetime.ts':
        "import type { NodeStore } from '../nodes/store.ts'; export const persist = (nodes: NodeStore) => nodes.commit();",
      'app/workflows/example/seed.test.ts':
        "import type { Store } from '@/vault/nodes/reading.ts'; export const seed = (nodes: Store) => nodes.commit();",
    };
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
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    expect(checkLayout(root).sort()).toEqual(
      ['alias', 'destructure', 'element', 'property'].map(
        (name) =>
          `app/workflows/example/${name}.ts accesses raw Node commit; use a TransactionStore write lifetime`,
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Questions ownership factories remain private when another module re-exports them', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-question-owner-policy-'));
  try {
    const files = {
      'app/workflows/questions/actions.ts':
        'export function createQuestionOwnership() { return {}; } export type QuestionWriter = {kind: string};',
      'app/workflows/questions/tools.ts':
        "import { createQuestionOwnership } from './actions.ts'; export const own = createQuestionOwnership;",
      'app/application/composition.ts':
        "import { createQuestionOwnership } from '../workflows/questions/actions.ts'; const own = createQuestionOwnership; export const exposed = own; export type { QuestionWriter } from '../workflows/questions/actions.ts';",
      'app/agent/helper.ts':
        "import { exposed as manufacture } from '../application/composition.ts'; export const own = manufacture;",
      'app/agent/types.ts':
        "import type { QuestionWriter } from '../application/composition.ts'; export type Author = QuestionWriter;",
    };
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
        include: ['app'],
      }),
    );
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    expect(checkLayout(root)).toEqual([
      'app/agent/helper.ts imports Application composition; dependencies point from Application to module owners',
      'app/agent/helper.ts accesses Questions ownership; compose actions in app/application/composition.ts',
      'app/agent/types.ts imports Application composition; dependencies point from Application to module owners',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Vault task UI composes shared presentation while persistence keeps its own implementation', () => {
  for (const source of [
    'app/vault/Gate.tsx',
    'app/vault/session/ui.tsx',
    'app/vault/storage/Settings.tsx',
    'app/vault/content/tool-presentation.tsx',
  ]) {
    expect(importProblem(source, 'app/ui/kit/index.ts')).toBeNull();
    expect(importProblem(source, 'app/ui/kit/parts/button.tsx')).toContain('private kit');
    expect(importProblem(source, 'app/application/Frame.tsx')).toContain(
      'imports Application composition',
    );
  }
  for (const source of [
    'app/vault/session/session.ts',
    'app/vault/nodes/store.ts',
    'app/vault/storage/nodes/github.ts',
    'app/vault/content/tools.ts',
    'app/vault/session/new-helper.tsx',
  ])
    expect(importProblem(source, 'app/ui/kit/index.ts')).toContain('presentation from the vault');
});

test('Wiki owns its records while migration and source readers stay outside its implementation', () => {
  expect(importProblem('app/workflows/wiki/records.ts', 'tools/migration/records.ts')).toContain(
    'migration depends on Wiki',
  );
  expect(importProblem('app/workflows/wiki/pages.ts', 'app/agent/sources.ts')).toContain(
    'source interpretation',
  );
  expect(importProblem('app/workflows/wiki/pages.ts', 'app/vault/content/sources.ts')).toContain(
    'source interpretation',
  );
  expect(importProblem('app/workflows/wiki/pages.ts', 'app/vault/records/sources.ts')).toContain(
    'source interpretation',
  );
  expect(importProblem('app/vault/records/index.ts', 'app/workflows/wiki/records.ts')).toContain(
    'optional workflow',
  );
  expect(importProblem('app/application/index.tsx', 'app/workflows/wiki/records.ts')).toBeNull();
  expect(importProblem('app/workflows/wiki/pages.ts', 'app/vault/sources.ts')).toBeNull();
});

test('compiler resolution rejects aliased and re-exported Wiki dependencies on migration', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-wiki-ownership-'));
  try {
    mkdirSync(join(root, 'app/workflows/wiki'), { recursive: true });
    mkdirSync(join(root, 'tools/migration'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          paths: { 'migration/*': ['./tools/migration/*'] },
        },
        include: ['app', 'tools'],
      }),
    );
    writeFileSync(join(root, 'tools/migration/records.ts'), 'export const value = 1;');
    writeFileSync(
      join(root, 'app/workflows/wiki/records.ts'),
      "export { value } from 'migration/records.ts';",
    );
    expect(checkLayout(root)).toEqual([
      'app/workflows/wiki/records.ts imports tooling; migration depends on Wiki, never Wiki on migration',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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

test('Application, shared views and features must compose the kit, including aliased factories and spread props', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-kit-policy-'));
  try {
    mkdirSync(join(root, 'app/search'), { recursive: true });
    mkdirSync(join(root, 'app/application'), { recursive: true });
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
      join(root, 'app/application/index.tsx'),
      `import { createElement as element } from '../factory.ts';
      const props = { className: 'custom' }; export const view = <div {...props} style={{color:'red'}} />;
      export const hidden = element('section');`,
    );
    writeFileSync(
      join(root, 'app/search/custom.tsx'),
      "import { Button } from 'radix-ui'; import './custom.css'; export const view = <button>Custom</button>;",
    );
    const problems = checkLayout(root);
    expect(problems).toEqual(
      expect.arrayContaining([
        'app/application/index.tsx: <div> must be a public kit component',
        'app/application/index.tsx: app views must compose the public kit instead of styling elements',
        'app/application/index.tsx: presentation props belong in the kit or content renderer',
        'app/application/index.tsx: intrinsic element factories belong in the kit or content renderer',
        'app/search/custom.tsx: <button> must be a public kit component',
        'app/search/custom.tsx: presentation dependencies belong behind app/ui/kit/index.ts',
        'app/search/custom.tsx: app styles belong in the kit or content renderer',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('outside the kit, only Application reads the size class', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-size-class-policy-'));
  try {
    mkdirSync(join(root, 'app/search'), { recursive: true });
    mkdirSync(join(root, 'app/application'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/search/Frame.ts'),
      "import { useLayout } from 'kit'; export const layout = useLayout();",
    );
    writeFileSync(
      join(root, 'app/application/index.tsx'),
      "import { useLayout } from 'kit'; export const layout = useLayout();",
    );
    expect(checkLayout(root)).toEqual([
      'app/search/Frame.ts: size-dependent presentation belongs in the kit',
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
    mkdirSync(join(root, 'app/search/search'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/search/search/presentation.ts'),
      "export const narrow = window.matchMedia('(max-width: 767px)');",
    );
    expect(checkLayout(root)).toEqual([
      'app/search/search/presentation.ts: viewport queries belong in the kit',
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
    mkdirSync(join(root, 'app/search'), { recursive: true });
    writeFileSync(join(root, 'app/search/Search.ts'), 'export const SearchView = 1;');
    for (const [i, source] of [
      "import { SearchView } from '@/search/Search.ts'; export { SearchView };",
      "export { SearchView } from '@/search/Search.ts';",
      "export const load = () => import('@/search/Search.ts');",
    ].entries()) {
      writeFileSync(join(root, `app/ui/kit/case${i}.ts`), source);
    }
    const problems = checkLayout(root);
    expect(problems).toHaveLength(3);
    expect(
      problems.every((problem) => problem.includes('kit owns generic presentation only')),
    ).toBe(true);
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

test('Chat renderer helpers cannot smuggle pane layout, styling or private kit implementation', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-chat-presentation-policy-'));
  try {
    mkdirSync(join(root, 'app/workflows/chat/rendering'), { recursive: true });
    mkdirSync(join(root, 'app/ui/kit'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'preserve',
          paths: { '@/*': ['./app/*'] },
        },
        include: ['app'],
      }),
    );
    writeFileSync(join(root, 'app/ui/kit/private.ts'), 'export const Pane = 1;');
    writeFileSync(
      join(root, 'app/workflows/chat/rendering/pane.tsx'),
      `
      import { Pane } from '@/ui/kit/private.ts';
      export const load = () => import('@/ui/kit/private.ts');
      import { Drawer } from '@base-ui/react/drawer';
      export const layout = matchMedia('(min-width: 768px)');
      export const pane = <div style={{ overflow: 'auto' }}><button>Expand</button></div>;
    `,
    );
    expect(checkLayout(root)).toEqual(
      expect.arrayContaining([
        'app/workflows/chat/rendering/pane.tsx imports a private kit file; use app/ui/kit/index.ts',
        'app/workflows/chat/rendering/pane.tsx: presentation dependencies belong behind app/ui/kit/index.ts',
        'app/workflows/chat/rendering/pane.tsx: viewport queries belong in the kit',
        'app/workflows/chat/rendering/pane.tsx: <div> must be a public kit component',
        'app/workflows/chat/rendering/pane.tsx: <button> must be a public kit component',
        'app/workflows/chat/rendering/pane.tsx: app views must compose the public kit instead of styling elements',
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
      join(root, 'app/workflows/wiki/rendering/blocks.tsx'),
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
      join(root, 'app/workflows/wiki/rendering/blocks.tsx'),
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

test('production entry reachability rejects fictional preview imports through helpers, aliases, re-exports and dynamic imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-production-preview-policy-'));
  try {
    mkdirSync(join(root, 'app/preview'), { recursive: true });
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
    writeFileSync(
      join(root, 'app/preview/records.ts'),
      'export const sample = 1; export interface Sample { title: string }',
    );
    writeFileSync(
      join(root, 'app/main.tsx'),
      "import { value } from './helper.ts'; export { value };",
    );
    for (const source of [
      "import { sample } from '@/preview/records.ts'; export const value = sample;",
      "export { sample as value } from '@/preview/records.ts';",
      "export const value = () => import('@/preview/records.ts');",
      "import type { Sample } from '@/preview/records.ts'; export type value = Sample;",
    ]) {
      writeFileSync(join(root, 'app/helper.ts'), source);
      expect(checkLayout(root)).toContain(
        'app/main.tsx reaches preview-only app/preview/records.ts through app/helper.ts',
      );
    }
    // A preview-owned caller may share production presentation; it is not a production root.
    writeFileSync(join(root, 'app/helper.ts'), 'export const value = 1;');
    writeFileSync(join(root, 'app/ui/kit/presentation.ts'), 'export const bounds = 1;');
    writeFileSync(
      join(root, 'app/preview/example.ts'),
      "import { bounds } from '../ui/kit/index.ts'; export { bounds };",
    );
    writeFileSync(join(root, 'app/ui/kit/index.ts'), "export { bounds } from './presentation.ts';");
    expect(checkLayout(root)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('renderer names and local aliases cannot hide application presentation', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-semantic-alias-policy-'));
  try {
    const files = {
      'app/workflows/wiki/rendering/new-card.tsx': `const Raw = 'div'; const style = {}; export const card = <Raw {...{style}}/>;`,
      'app/search/size.ts': `export function useLayout() { return 'compact'; }`,
      'app/search/bridge.ts': `export { useLayout as dimensions } from './size.ts';`,
      'app/workflows/wiki/helper.ts': `import { dimensions } from '../../search/bridge.ts'; const alias = dimensions; alias(); const query = window.matchMedia; query('(hover: hover)');`,
      'app/factory.ts': 'export function createElement(tag: string) { return tag; }',
      'app/search/view.ts': `import { createElement } from '../factory.ts'; const element = createElement; element('section');`,
    };
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
        include: ['app'],
      }),
    );
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    expect(checkLayout(root)).toEqual(
      expect.arrayContaining([
        'app/workflows/wiki/rendering/new-card.tsx: <div> must be a public kit component',
        'app/workflows/wiki/rendering/new-card.tsx: presentation props belong in the kit or content renderer',
        'app/workflows/wiki/helper.ts: size-dependent presentation belongs in the kit',
        'app/workflows/wiki/helper.ts: viewport queries belong in the kit',
        'app/search/view.ts: intrinsic element factories belong in the kit or content renderer',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('typed intrinsic aliases and factory tag aliases cannot bypass semantic ownership', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-typed-tag-policy-'));
  try {
    mkdirSync(join(root, 'app/search'), { recursive: true });
    mkdirSync(join(root, 'app/application'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/search/view.tsx'),
      `const Raw = ('div' as const); function createElement(tag:string){return tag}; const element=createElement; const tag='section'; export const view=<Raw/>; element(tag);`,
    );
    expect(checkLayout(root)).toEqual(
      expect.arrayContaining([
        'app/search/view.tsx: <div> must be a public kit component',
        'app/search/view.tsx: intrinsic element factories belong in the kit or content renderer',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('new module helpers cannot hide viewport queries in values or own scroll mechanics', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-module-scroll-policy-'));
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
      join(root, 'app/workflows/example/helper.ts'),
      `const query='(min-width: 800px)'; const media=window.matchMedia; media(query); export function helper(node:HTMLElement){node.scrollTo(0,0);new ResizeObserver(()=>{});}`,
    );
    expect(checkLayout(root)).toEqual(
      expect.arrayContaining([
        'app/workflows/example/helper.ts: viewport queries belong in the kit',
        'app/workflows/example/helper.ts: passage measurement and scrolling belong in the kit',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('computed style props and bracket measurement cannot escape through helper values', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-computed-presentation-'));
  try {
    mkdirSync(join(root, 'app/workflows/example'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
        include: ['app'],
      }),
    );
    const cases = {
      computed: `const property='style'; const props={ [property]: { width: 500 } }; export const view=<Text {...props}/>;`,
      spread: `const props={ ['className']: 'custom' }; function helper(){return {...props}}; export const view=<Text {...helper()}/>;`,
      measurement: `export function measure(node:HTMLElement){return node['getBoundingClientRect']()}`,
      scrolling: 'export function move(node:HTMLElement){const {scrollTo: move}=node;move(0,0);}',
    };
    for (const [name, source] of Object.entries(cases))
      writeFileSync(join(root, `app/workflows/example/${name}.tsx`), source);
    const problems = checkLayout(root);
    for (const name of ['computed', 'spread'])
      expect(problems).toContain(
        `app/workflows/example/${name}.tsx: presentation props belong in the kit or content renderer`,
      );
    for (const name of ['measurement', 'scrolling'])
      expect(problems).toContain(
        `app/workflows/example/${name}.tsx: passage measurement and scrolling belong in the kit`,
      );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('direct viewport dimensions and destructured aliases remain kit-owned', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-viewport-dimensions-'));
  try {
    mkdirSync(join(root, 'app/workflows/example'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['app'],
      }),
    );
    const cases = {
      width: 'export const compact=window.innerWidth<768;',
      height: `export const height=window['innerHeight'];`,
      visual: 'export const width=window.visualViewport?.width;',
      visualAlias:
        'const viewport=window.visualViewport; const {height:tall}=viewport!; export const height=tall;',
      destructured: 'const {innerWidth:size}=window; export const compact=size<768;',
      nested: `const {visualViewport:viewport}=window; const width=viewport?.['width']; export {width};`,
    };
    for (const [name, source] of Object.entries(cases))
      writeFileSync(join(root, `app/workflows/example/${name}.ts`), source);
    const problems = checkLayout(root);
    for (const name of Object.keys(cases))
      expect(problems).toContain(
        `app/workflows/example/${name}.ts: viewport dimensions belong in the kit`,
      );
    writeFileSync(
      join(root, 'app/workflows/example/data.ts'),
      'const data={width:300,height:200};export const size=data.width+data.height;',
    );
    expect(checkLayout(root).some((problem) => problem.includes('/data.ts:'))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('semantic rendering permits content and links but delegates custom controls to public Button', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-semantic-controls-'));
  try {
    mkdirSync(join(root, 'app/workflows/wiki/rendering'), { recursive: true });
    mkdirSync(join(root, 'app/ui/kit'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/ui/kit/index.ts'),
      'export declare function Button(props:unknown):unknown;',
    );
    const file = join(root, 'app/workflows/wiki/rendering/blocks.tsx');
    for (const source of [
      `<span role="button" tabIndex={0} onClick={()=>{}}>Disclosure</span>`,
      `<a href="#source" onClick={()=>{}}>Custom control</a>`,
      `const action={['onKeyDown']:()=>{}};<span {...action}>Disclosure</span>`,
      'const props={onClick(){}};export const view=<span {...props}>Disclosure</span>;',
      `const event='onKeyDown';const props={ [event](){}};export const view=<span {...props}>Disclosure</span>;`,
      'const props={get onClick(){return ()=>{}}};export const view=<span {...props}>Disclosure</span>;',
      'const props={set onClick(handler:()=>void){}};export const view=<span {...props}>Disclosure</span>;',
      `const role='checkbox';<span role={role}>Check</span>`,
      '<span contentEditable>Editor</span>',
    ]) {
      writeFileSync(file, source);
      expect(checkLayout(root)).toContain(
        'app/workflows/wiki/rendering/blocks.tsx: semantic content controls belong in public kit components',
      );
    }
    writeFileSync(
      file,
      `import {Button} from '../../../ui/kit/index.ts';export const content=<p><a href="https://example.com" rel="noreferrer">Source</a><span role="note">Retained text</span><Button onClick={()=>{}} aria-pressed={false}>Evidence</Button></p>;`,
    );
    expect(checkLayout(root)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('installed presentation-library targets cannot hide behind path aliases or module loading forms', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-library-targets-'));
  try {
    mkdirSync(join(root, 'app/workflows/example'), { recursive: true });
    mkdirSync(join(root, 'app/ui/kit'), { recursive: true });
    const library = fileURLToPath(
      new URL('../../node_modules/@base-ui/react/button/index.d.ts', import.meta.url),
    );
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          paths: { '@controls': [library] },
        },
        include: ['app'],
      }),
    );
    const cases = {
      import: `import {Button} from '@controls';export {Button};`,
      export: `export {Button} from '@controls';`,
      dynamic: `export const controls=()=>import('@controls');`,
    };
    for (const [name, source] of Object.entries(cases))
      writeFileSync(join(root, `app/workflows/example/${name}.ts`), source);
    writeFileSync(join(root, 'app/ui/kit/control.ts'), `export {Button} from '@controls';`);
    const problems = checkLayout(root);
    for (const name of Object.keys(cases))
      expect(problems).toContain(
        `app/workflows/example/${name}.ts: presentation dependencies belong behind app/ui/kit/index.ts`,
      );
    expect(problems.some((problem) => problem.includes('app/ui/kit/control.ts:'))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module owners cannot depend on their consumers or standalone vault checking', () => {
  for (const owner of ['runtime', 'navigation', 'settings', 'vault/nodes']) {
    expect(
      importProblem(`app/${owner}/core.ts`, 'tools/vault-check/validation/check.ts'),
    ).toContain('standalone vault checking');
    expect(importProblem(`app/${owner}/core.ts`, 'app/application/composition.ts')).toContain(
      'imports Application composition',
    );
    expect(importProblem(`app/${owner}/core.ts`, 'app/agent/records.ts')).toContain('higher-level');
  }
  for (const target of ['navigation/routing.ts', 'settings/store.ts', 'search/Search.tsx'])
    expect(importProblem('app/ui/kit/control.tsx', `app/${target}`)).toContain(
      'kit owns generic presentation only',
    );
  expect(
    importProblem('app/application/composition.ts', 'app/workflows/questions/actions.ts'),
  ).toBeNull();
  expect(
    importProblem('app/application/connections.test.ts', 'app/workflows/wiki/subjects.ts'),
  ).toBeNull();
});

test('Wiki and Questions stay independent across value, type, dynamic and import-type references', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-peer-records-'));
  try {
    const files = {
      'app/workflows/wiki/records.ts': 'export const value = 1; export type Record = string;',
      'app/workflows/questions/records.ts': 'export const value = 1; export type Record = string;',
    };
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
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    for (const [from, to] of [
      ['wiki', 'questions'],
      ['questions', 'wiki'],
    ]) {
      const path = `@/workflows/${to}/records.ts`;
      const sources = [
        `import { value } from '${path}'; export { value };`,
        `export * from '${path}';`,
        `export const load = () => import('${path}');`,
        `import type { Record } from '${path}'; export type Data = Record;`,
        `export type Data = import('${path}').Record;`,
      ];
      for (const [i, source] of sources.entries())
        writeFileSync(join(root, `app/workflows/${from}/case${i}.ts`), source);
    }
    const problems = checkLayout(root);
    expect(problems).toHaveLength(10);
    expect(problems.every((problem) => problem.includes('imports optional workflow'))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runtime cycles include values, re-exports and dynamic imports while type cycles stay distinct', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-import-cycles-'));
  try {
    const files = {
      'app/runtime/a.ts': "export { b } from './b.ts'; export const a = 1;",
      'app/runtime/b.ts': "export const b = () => import('./a.ts');",
      'app/runtime/c.ts': "import './d.ts'; export const c = 1;",
      'app/runtime/d.ts': "import { c } from './c.ts'; export const d = c;",
      'app/runtime/type-a.ts': "import type { B } from './type-b.ts'; export type A = B[];",
      'app/runtime/type-b.ts': "export type B = import('./type-a.ts').A[];",
      'app/runtime/type-c.ts': "import { type D } from './type-d.ts'; export type C = D[];",
      'app/runtime/type-d.ts': "export { type C as D } from './type-c.ts';",
    };
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['app'],
      }),
    );
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    expect(checkLayout(root)).toEqual([
      'Runtime import cycle: app/runtime/a.ts -> app/runtime/b.ts -> app/runtime/a.ts',
      'Runtime import cycle: app/runtime/c.ts -> app/runtime/d.ts -> app/runtime/c.ts',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('application behavior cannot return to an unowned shared UI folder', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-ui-owner-'));
  try {
    mkdirSync(join(root, 'app/ui'), { recursive: true });
    writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ include: ['app'] }));
    writeFileSync(join(root, 'app/ui/helper.ts'), 'export const state = {};');
    expect(checkLayout(root)).toEqual([
      'app/ui/helper.ts: app/ui contains only the kit; place application behavior with its owner',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
