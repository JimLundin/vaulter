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
    importProblem(
      'app/modules/conversation/presentation/Chat.tsx',
      'app/modules/questions/presentation/index.tsx',
    ),
  ).toContain('compose');
  expect(importProblem('app/core/session/index.ts', 'app/modules/questions/index.ts')).toContain(
    'optional workflow',
  );
  expect(
    importProblem(
      'app/application/presentation/Frame.tsx',
      'app/modules/conversation/presentation/index.tsx',
    ),
  ).toContain('compose');
  expect(
    importProblem(
      'app/application/presentation/index.tsx',
      'app/core/history/presentation/index.tsx',
    ),
  ).toBeNull();
  expect(
    importProblem('app/modules/conversation/presentation/Chat.tsx', 'app/core/history/nodes.ts'),
  ).toContain('private core');
  expect(
    importProblem(
      'app/core/history/presentation/index.tsx',
      'app/core/history/presentation/History.tsx',
    ),
  ).toBeNull();
  expect(
    importProblem(
      'app/modules/conversation/presentation/Chat.tsx',
      'app/shared/ui/kit/parts/button.tsx',
    ),
  ).toContain('private kit');
});

test('removed store imports cannot return, including tests and storage assembly', () => {
  for (const entry of ['app/vault/nodes/memory.ts', 'app/core/persistence/nodes/github.ts'])
    for (const caller of [
      'app/main.tsx',
      'app/modules/agent/tools.test.ts',
      'app/application/composition/composition.ts',
    ])
      expect(importProblem(caller, entry)).toContain('removed store');
  expect(importProblem('app/modules/agent/new-tool.ts', 'app/preview/eav.ts')).toContain(
    'preview-only',
  );
  expect(importProblem('app/modules/agent/new-tool.test.ts', 'app/preview/eav.ts')).toBeNull();
  expect(
    importProblem('app/modules/agent/new-tool.ts', 'app/modules/agent/contracts.type-test.ts'),
  ).toContain('test-only');
});

test('browser drivers are shared across test owners without exposing private kit code', () => {
  const driver = 'app/shared/ui/kit/navigation.browser.test-support.ts';
  expect(importProblem('app/modules/conversation/eav-chat.browser.test.ts', driver)).toBeNull();
  expect(importProblem('app/application/navigation.browser.test.ts', driver)).toBeNull();
  expect(importProblem('app/modules/conversation/presentation/Chat.tsx', driver)).toContain(
    'test-only',
  );
  expect(
    importProblem(
      'app/modules/conversation/eav-chat.browser.test.ts',
      'app/shared/ui/kit/navigation.tsx',
    ),
  ).toContain('private kit');
});

test('raw session hooks remain with Vault assembly and Application through every import form', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-vault-session-policy-'));
  try {
    const files = {
      'app/core/session/session.ts':
        'export function useSession() { return {storage: {}}; } export type Session = {storage: unknown};',
      'app/core/session/index.ts':
        "import { useSession } from './session.ts'; export { useSession as open }; export function useVaultSession() { return useSession(); } export type { Session } from './session.ts';",
      'app/application/presentation/index.tsx':
        "import { useVaultSession } from '@/core/session/index.ts'; const session = useVaultSession; export const exposed = session;",
      'app/modules/agent/import.ts':
        "import { open as session } from '@/core/session/index.ts'; export { session };",
      'app/modules/agent/value-alias.ts':
        "import { exposed as session } from '@/application/presentation/index.tsx'; export { session };",
      'app/modules/agent/export.ts': "export { open } from '@/core/session/index.ts';",
      'app/modules/agent/export-all.ts': "export * from '@/core/session/index.ts';",
      'app/modules/agent/namespace.ts':
        "import * as vault from '@/core/session/index.ts'; export { vault };",
      'app/modules/agent/export-namespace.ts': "export * as vault from '@/core/session/index.ts';",
      'app/modules/agent/dynamic.ts':
        "export const vault = () => import('@/core/session/index.ts');",
      'app/modules/agent/types.ts':
        "import type { Session } from '@/core/session/index.ts'; export type State = Session;",
      'app/core/session/owner.ts':
        "import { useSession } from './session.ts'; export { useSession };",
      'app/modules/agent/session.test.ts':
        "import { useSession } from '@/core/session/session.ts'; import { useVaultSession } from '@/core/session/index.ts'; export { useSession, useVaultSession };",
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
    const problems = checkLayout(root);
    for (const name of [
      'import',
      'value-alias',
      'export',
      'export-all',
      'namespace',
      'export-namespace',
      'dynamic',
    ])
      expect(problems).toContain(
        `app/modules/agent/${name}.ts accesses a raw vault session; use the Application-supplied database`,
      );
    expect(problems.some((problem) => problem.startsWith('app/modules/agent/types.ts'))).toBe(
      false,
    );
    expect(problems.some((problem) => problem.startsWith('app/core/session/owner.ts'))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compiler ownership follows EAV storage and database factories through aliases and re-exports', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-eav-factories-'));
  try {
    const files = {
      'app/core/store/memory.ts': 'export function createMemoryStorage() { return {}; }',
      'app/core/store/engine.ts': 'export function openDatabase() { return {}; }',
      'app/core/store/index.ts':
        "export {createMemoryStorage} from './memory.ts'; export {openDatabase} from './engine.ts';",
      'app/application/composition/composition.ts':
        "import {openDatabase} from '@/core/store/index.ts'; const open=openDatabase; export {open};",
      'app/main.tsx':
        "import {createMemoryStorage} from './application/store/index.ts'; export {createMemoryStorage};",
      'app/preview/seed.ts':
        "import {createMemoryStorage,openDatabase} from '@/core/store/index.ts'; export {createMemoryStorage,openDatabase};",
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
    const cases = {
      import:
        "import {createMemoryStorage as build,openDatabase as open} from '@/core/store/index.ts'; export {build,open};",
      export: "export {createMemoryStorage,openDatabase} from '@/core/store/index.ts';",
      all: "export * from '@/core/store/index.ts';",
      namespace: "import * as eav from '@/core/store/index.ts'; export {eav};",
      dynamic: "export const load=()=>import('@/core/store/index.ts');",
      alias: "import {open} from '@/application/composition/composition.ts'; export {open};",
    };
    for (const [name, source] of Object.entries(cases))
      Object.assign(files, { [`app/modules/agent/${name}.ts`]: source });
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    const problems = checkLayout(root);
    for (const name of Object.keys(cases))
      expect(problems).toContain(
        `app/modules/agent/${name}.ts opens an EAV database; compose database ownership in Application`,
      );
    for (const name of Object.keys(cases).filter((caseName) => caseName !== 'alias'))
      expect(problems).toContain(
        `app/modules/agent/${name}.ts constructs raw EAV storage; use the Application-supplied database`,
      );
    expect(problems.some((problem) => problem.startsWith('app/main.tsx '))).toBe(false);
    expect(problems.some((problem) => problem.startsWith('app/preview/seed.ts '))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('raw journal publication cannot escape through properties, destructuring or aliases', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-eav-append-'));
  try {
    const files = {
      'app/core/store/persistence.ts':
        'export interface StorageAdapter {append():void;load():void;}',
      'app/core/store/index.ts': "export type {StorageAdapter} from './persistence.ts';",
      'app/workflows/example/property.ts':
        "import type {StorageAdapter} from '@/core/store/index.ts'; export const write=(adapter:StorageAdapter)=>adapter.append();",
      'app/workflows/example/element.ts':
        "import type {StorageAdapter} from '@/core/store/index.ts'; const method='append'; export const write=(adapter:StorageAdapter)=>adapter[method]();",
      'app/workflows/example/destructure.ts':
        "import type {StorageAdapter} from '@/core/store/index.ts'; declare const adapter:StorageAdapter; const {append:publish}=adapter; export {publish};",
      'app/workflows/example/alias.ts':
        "import type {StorageAdapter} from '@/core/store/index.ts'; declare const adapter:StorageAdapter;const borrowed=adapter; const publish=borrowed.append;export {publish};",
      'app/workflows/example/read.ts':
        "import type {StorageAdapter} from '@/core/store/index.ts';export const read=(adapter:StorageAdapter)=>adapter.load();",
      'app/workflows/example/unrelated.ts':
        'interface Files {append():void} export const save=(files:Files)=>files.append();',
      'app/core/persistence/journal/writer.ts':
        "import type {StorageAdapter} from '../../eav/index.ts'; export const persist=(adapter:StorageAdapter)=>adapter.append();",
      'app/workflows/example/seed.test.ts':
        "import type {StorageAdapter} from '@/core/store/index.ts';export const seed=(adapter:StorageAdapter)=>adapter.append();",
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
      ['alias', 'destructure', 'element', 'property'].map(
        (name) =>
          `app/workflows/example/${name}.ts accesses raw EAV append; write through database.transaction`,
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('deleted modules and store types stay forbidden even through unresolved and type-only imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-retired-store-'));
  try {
    const files = {
      'app/vault/nodes/reintroduced.ts': 'export const old=1;',
      'app/modules/agent/types.ts': 'export interface NodeStore {}',
      'app/modules/agent/missing.ts': "export type Store=import('@/vault/nodes/store.ts').Store;",
      'app/modules/agent/type-only.ts':
        "import type {Store} from '../../vault/storage/nodes/missing.ts';export type Data=Store;",
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
    expect(checkLayout(root)).toEqual(
      expect.arrayContaining([
        'app/vault/nodes/reintroduced.ts: the removed store cannot be reintroduced; use EAV',
        'app/modules/agent/types.ts: removed store type NodeStore cannot be reintroduced; use EAV',
        'app/modules/agent/missing.ts imports the removed store; use the typed EAV interface',
        'app/modules/agent/type-only.ts imports the removed store; use the typed EAV interface',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Questions ownership factories remain private when another module re-exports them', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-question-owner-policy-'));
  try {
    const files = {
      'app/modules/questions/operations.ts':
        'export function questionActions() { return {}; } export type QuestionDatabase = {kind: string};',
      'app/modules/questions/tools.ts':
        "import { questionActions } from './operations.ts'; export const own = questionActions;",
      'app/application/composition/composition.ts':
        "import { questionActions } from '../../modules/questions/operations.ts'; const own = questionActions; export const exposed = own; export type { QuestionDatabase } from '../../modules/questions/operations.ts';",
      'app/modules/agent/helper.ts':
        "import { exposed as manufacture } from '../../application/composition/composition.ts'; export const own = manufacture;",
      'app/modules/agent/types.ts':
        "import type { QuestionDatabase } from '../../application/composition/composition.ts'; export type Author = QuestionDatabase;",
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
    expect(checkLayout(root).sort()).toEqual(
      [
        'app/modules/agent/helper.ts imports Application composition; dependencies point from Application to module owners',
        'app/modules/agent/helper.ts accesses Questions ownership; compose actions in app/application/composition/composition.ts',
        'app/modules/agent/types.ts imports Application composition; dependencies point from Application to module owners',
        'app/application/composition/composition.ts imports private questions implementation; use its public entry',
      ].sort(),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Vault task UI composes shared presentation while persistence keeps its own implementation', () => {
  for (const source of [
    'app/core/session/presentation/Gate.tsx',
    'app/core/session/presentation/ui.tsx',
    'app/core/persistence/presentation/Settings.tsx',
  ]) {
    expect(importProblem(source, 'app/shared/ui/kit/index.ts')).toBeNull();
    expect(importProblem(source, 'app/shared/ui/kit/parts/button.tsx')).toContain('private kit');
    expect(importProblem(source, 'app/application/presentation/Frame.tsx')).toContain(
      'imports Application composition',
    );
  }
  for (const source of [
    'app/core/session/session.ts',
    'app/core/store/types.ts',
    'app/core/persistence/journal/github.ts',
    'app/vault/content/tools.ts',
    'app/core/session/new-helper.tsx',
  ])
    expect(importProblem(source, 'app/shared/ui/kit/index.ts')).toMatch(
      /presentation from the vault|higher-level/,
    );
});

test('Wiki owns its records while migration and source readers stay outside its implementation', () => {
  expect(importProblem('app/modules/wiki/records.ts', 'tools/migration/records.ts')).toContain(
    'migration depends on Wiki',
  );
  expect(importProblem('app/modules/wiki/pages.ts', 'app/modules/agent/sources.ts')).toContain(
    'source interpretation',
  );
  expect(importProblem('app/modules/wiki/pages.ts', 'app/vault/content/sources.ts')).toContain(
    'source interpretation',
  );
  expect(importProblem('app/modules/wiki/pages.ts', 'app/vault/records/sources.ts')).toContain(
    'source interpretation',
  );
  expect(importProblem('app/vault/records/sources.ts', 'app/modules/wiki/records.ts')).toContain(
    'optional workflow',
  );
  expect(
    importProblem('app/application/presentation/index.tsx', 'app/modules/wiki/records.ts'),
  ).toContain('private wiki');
  expect(importProblem('app/modules/wiki/pages.ts', 'app/vault/sources.ts')).toBeNull();
});

test('compiler resolution rejects aliased and re-exported Wiki dependencies on migration', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-wiki-ownership-'));
  try {
    mkdirSync(join(root, 'app/modules/wiki'), { recursive: true });
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
      join(root, 'app/modules/wiki/records.ts'),
      "export { value } from 'migration/records.ts';",
    );
    expect(checkLayout(root)).toEqual([
      'app/modules/wiki/records.ts imports tooling; migration depends on Wiki, never Wiki on migration',
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
    mkdirSync(join(root, 'app/shared/ui/kit'), { recursive: true });
    mkdirSync(join(root, 'app/workflows/example'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/shared/ui/kit/drawer.ts'),
      "export { Drawer } from '@base-ui/react/drawer';",
    );
    writeFileSync(
      join(root, 'app/workflows/example/view.ts'),
      "import { Drawer } from '@base-ui/react/drawer'; export const view = Drawer;",
    );
    expect(checkLayout(root)).toEqual([
      'app/workflows/example/view.ts: presentation dependencies belong behind app/shared/ui/kit/index.ts',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Application, shared views and features must compose the kit, including aliased factories and spread props', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-kit-policy-'));
  try {
    mkdirSync(join(root, 'app/core/search'), { recursive: true });
    mkdirSync(join(root, 'app/application/presentation'), { recursive: true });
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
      join(root, 'app/application/presentation/index.tsx'),
      `import { createElement as element } from '../../factory.ts';
      const props = { className: 'custom' }; export const view = <div {...props} style={{color:'red'}} />;
      export const hidden = element('section');`,
    );
    writeFileSync(
      join(root, 'app/core/search/custom.tsx'),
      "import { Button } from 'radix-ui'; import './custom.css'; export const view = <button>Custom</button>;",
    );
    const problems = checkLayout(root);
    expect(problems).toEqual(
      expect.arrayContaining([
        'app/application/presentation/index.tsx: <div> must be a public kit component',
        'app/application/presentation/index.tsx: app views must compose the public kit instead of styling elements',
        'app/application/presentation/index.tsx: presentation props belong in the kit or content renderer',
        'app/application/presentation/index.tsx: intrinsic element factories belong in the kit or content renderer',
        'app/core/search/custom.tsx: <button> must be a public kit component',
        'app/core/search/custom.tsx: presentation dependencies belong behind app/shared/ui/kit/index.ts',
        'app/core/search/custom.tsx: app styles belong in the kit or content renderer',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('outside the kit, only Application reads the size class', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-size-class-policy-'));
  try {
    mkdirSync(join(root, 'app/core/search'), { recursive: true });
    mkdirSync(join(root, 'app/application/presentation'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/core/search/Frame.ts'),
      "import { useLayout } from 'kit'; export const layout = useLayout();",
    );
    writeFileSync(
      join(root, 'app/application/presentation/index.tsx'),
      "import { useLayout } from 'kit'; export const layout = useLayout();",
    );
    expect(checkLayout(root)).toEqual([
      'app/core/search/Frame.ts: size-dependent presentation belongs in the kit',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('shared row presentation cannot interpret Vault records through aliases, re-exports or dynamic imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-record-presentation-policy-'));
  try {
    mkdirSync(join(root, 'app/shared/ui/kit'), { recursive: true });
    mkdirSync(join(root, 'app/modules/sources'), { recursive: true });
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
    writeFileSync(join(root, 'app/modules/sources/records.ts'), 'export const transaction = 1;');
    const imports = [
      "import { transaction } from '@/modules/sources/records.ts'; export { transaction };",
      "export { transaction } from '@/modules/sources/records.ts';",
      "export const load = () => import('@/modules/sources/records.ts');",
    ];
    for (const [index, source] of imports.entries())
      writeFileSync(join(root, `app/shared/ui/kit/row${index}.ts`), source);
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
    mkdirSync(join(root, 'app/core/search/search'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/core/search/search/presentation.ts'),
      "export const narrow = window.matchMedia('(max-width: 767px)');",
    );
    expect(checkLayout(root)).toEqual([
      'app/core/search/search/presentation.ts: viewport queries belong in the kit',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('kit mechanics cannot import Search task rendering through aliases or re-exports', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-search-ownership-policy-'));
  try {
    mkdirSync(join(root, 'app/shared/ui/kit'), { recursive: true });
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
    mkdirSync(join(root, 'app/core/search'), { recursive: true });
    writeFileSync(join(root, 'app/core/search/Search.ts'), 'export const SearchView = 1;');
    for (const [i, source] of [
      "import { SearchView } from '@/core/search/Search.ts'; export { SearchView };",
      "export { SearchView } from '@/core/search/Search.ts';",
      "export const load = () => import('@/core/search/Search.ts');",
    ].entries()) {
      writeFileSync(join(root, `app/shared/ui/kit/case${i}.ts`), source);
    }
    const problems = checkLayout(root);
    expect(problems).toHaveLength(3);
    expect(
      problems.every((problem) => problem.includes('Shared cannot depend on its consumers')),
    ).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('supporting-pane callers cannot hide private presentation access behind aliases or helpers', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-pane-policy-'));
  try {
    mkdirSync(join(root, 'app/shared/ui/kit'), { recursive: true });
    mkdirSync(join(root, 'app/workflows/example'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'preserve',
          paths: { '@kit/*': ['./app/shared/ui/kit/*'] },
        },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/shared/ui/kit/drawer.tsx'),
      'export function Drawer() { return null; }',
    );
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
        'app/workflows/example/helper.tsx imports a private kit file; use app/shared/ui/kit/index.ts',
        'app/workflows/example/helper.tsx: presentation props belong in the kit or content renderer',
        'app/workflows/example/view.tsx imports a private kit file; use app/shared/ui/kit/index.ts',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Chat renderer helpers cannot smuggle pane layout, styling or private kit implementation', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-chat-presentation-policy-'));
  try {
    mkdirSync(join(root, 'app/modules/conversation/rendering'), { recursive: true });
    mkdirSync(join(root, 'app/shared/ui/kit'), { recursive: true });
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
    writeFileSync(join(root, 'app/shared/ui/kit/private.ts'), 'export const Pane = 1;');
    writeFileSync(
      join(root, 'app/modules/conversation/rendering/pane.tsx'),
      `
      import { Pane } from '@/shared/ui/kit/private.ts';
      export const load = () => import('@/shared/ui/kit/private.ts');
      import { Drawer } from '@base-ui/react/drawer';
      export const layout = matchMedia('(min-width: 768px)');
      export const pane = <div style={{ overflow: 'auto' }}><button>Expand</button></div>;
    `,
    );
    expect(checkLayout(root)).toEqual(
      expect.arrayContaining([
        'app/modules/conversation/rendering/pane.tsx imports a private kit file; use app/shared/ui/kit/index.ts',
        'app/modules/conversation/rendering/pane.tsx: presentation dependencies belong behind app/shared/ui/kit/index.ts',
        'app/modules/conversation/rendering/pane.tsx: viewport queries belong in the kit',
        'app/modules/conversation/rendering/pane.tsx: <div> must be a public kit component',
        'app/modules/conversation/rendering/pane.tsx: <button> must be a public kit component',
        'app/modules/conversation/rendering/pane.tsx: app views must compose the public kit instead of styling elements',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Wiki renderers accept semantic content but cannot own application presentation', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-wiki-policy-'));
  try {
    mkdirSync(join(root, 'app/modules/wiki/presentation/rendering'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/modules/wiki/presentation/rendering/blocks.tsx'),
      'export const content = <section id="claim"><h2>Title</h2><p><strong>Retained</strong> text <a href="#/wiki/page/">Page</a></p><table><tbody><tr><td data-align="right">1</td></tr></tbody></table></section>;',
    );
    expect(checkLayout(root)).toEqual([]);
    writeFileSync(
      join(root, 'app/modules/wiki/presentation/rendering/presentation.tsx'),
      `import { Drawer } from '@base-ui/react/drawer';
      export const card = <div className="overflow-auto"><button>Context</button></div>;
      export const viewport = window.matchMedia('(min-width: 768px)');`,
    );
    const problems = checkLayout(root);
    expect(problems).toEqual(
      expect.arrayContaining([
        'app/modules/wiki/presentation/rendering/presentation.tsx: <div> must be a public kit component',
        'app/modules/wiki/presentation/rendering/presentation.tsx: <button> must be a public kit component',
        'app/modules/wiki/presentation/rendering/presentation.tsx: app views must compose the public kit instead of styling elements',
        'app/modules/wiki/presentation/rendering/presentation.tsx: presentation dependencies belong behind app/shared/ui/kit/index.ts',
        'app/modules/wiki/presentation/rendering/presentation.tsx: viewport queries belong in the kit',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Wiki passage renderers and private helpers cannot own controls, clipping or scroll mechanics', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-passage-policy-'));
  try {
    mkdirSync(join(root, 'app/modules/wiki/presentation/rendering/private'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/modules/wiki/presentation/rendering/blocks.tsx'),
      'export const passage = <blockquote><strong>Retained</strong> <mark>selected</mark> <a href="#/source/">Source</a></blockquote>;',
    );
    expect(checkLayout(root)).toEqual([]);
    writeFileSync(
      join(root, 'app/modules/wiki/presentation/rendering/references.tsx'),
      `import { hide } from './private/clipping.ts';
      export const passage = <section className="card"><button onClick={hide}>Context</button></section>;`,
    );
    writeFileSync(
      join(root, 'app/modules/wiki/presentation/rendering/private/clipping.ts'),
      'export function hide(node: HTMLElement) { node.scrollTop = 20; node.getBoundingClientRect(); new ResizeObserver(() => {}); }',
    );
    const problems = checkLayout(root);
    expect(problems).toEqual(
      expect.arrayContaining([
        'app/modules/wiki/presentation/rendering/references.tsx: <button> must be a public kit component',
        'app/modules/wiki/presentation/rendering/references.tsx: app views must compose the public kit instead of styling elements',
        'app/modules/wiki/presentation/rendering/private/clipping.ts: passage measurement and scrolling belong in the kit',
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
    mkdirSync(join(root, 'app/shared/ui/kit'), { recursive: true });
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
    writeFileSync(join(root, 'app/shared/ui/kit/presentation.ts'), 'export const bounds = 1;');
    writeFileSync(
      join(root, 'app/preview/example.ts'),
      "import { bounds } from '../shared/ui/kit/index.ts'; export { bounds };",
    );
    writeFileSync(
      join(root, 'app/shared/ui/kit/index.ts'),
      "export { bounds } from './presentation.ts';",
    );
    expect(checkLayout(root)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('renderer names and local aliases cannot hide application presentation', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-semantic-alias-policy-'));
  try {
    const files = {
      'app/modules/wiki/presentation/rendering/new-card.tsx': `const Raw = 'div'; const style = {}; export const card = <Raw {...{style}}/>;`,
      'app/core/search/size.ts': `export function useLayout() { return 'compact'; }`,
      'app/core/search/bridge.ts': `export { useLayout as dimensions } from './size.ts';`,
      'app/modules/wiki/helper.ts': `import { dimensions } from '../../core/search/bridge.ts'; const alias = dimensions; alias(); const query = window.matchMedia; query('(hover: hover)');`,
      'app/factory.ts': 'export function createElement(tag: string) { return tag; }',
      'app/core/search/view.ts': `import { createElement } from '../../factory.ts'; const element = createElement; element('section');`,
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
        'app/modules/wiki/presentation/rendering/new-card.tsx: <div> must be a public kit component',
        'app/modules/wiki/presentation/rendering/new-card.tsx: presentation props belong in the kit or content renderer',
        'app/modules/wiki/helper.ts: size-dependent presentation belongs in the kit',
        'app/modules/wiki/helper.ts: viewport queries belong in the kit',
        'app/core/search/view.ts: intrinsic element factories belong in the kit or content renderer',
      ]),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('typed intrinsic aliases and factory tag aliases cannot bypass semantic ownership', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-typed-tag-policy-'));
  try {
    mkdirSync(join(root, 'app/core/search'), { recursive: true });
    mkdirSync(join(root, 'app/application/presentation'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/core/search/view.tsx'),
      `const Raw = ('div' as const); function createElement(tag:string){return tag}; const element=createElement; const tag='section'; export const view=<Raw/>; element(tag);`,
    );
    expect(checkLayout(root)).toEqual(
      expect.arrayContaining([
        'app/core/search/view.tsx: <div> must be a public kit component',
        'app/core/search/view.tsx: intrinsic element factories belong in the kit or content renderer',
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
    mkdirSync(join(root, 'app/modules/wiki/presentation/rendering'), { recursive: true });
    mkdirSync(join(root, 'app/shared/ui/kit'), { recursive: true });
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', jsx: 'preserve' },
        include: ['app'],
      }),
    );
    writeFileSync(
      join(root, 'app/shared/ui/kit/index.ts'),
      'export declare function Button(props:unknown):unknown;',
    );
    const file = join(root, 'app/modules/wiki/presentation/rendering/blocks.tsx');
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
        'app/modules/wiki/presentation/rendering/blocks.tsx: semantic content controls belong in public kit components',
      );
    }
    writeFileSync(
      file,
      `import {Button} from '../../../shared/ui/kit/index.ts';export const content=<p><a href="https://example.com" rel="noreferrer">Source</a><span role="note">Retained text</span><Button onClick={()=>{}} aria-pressed={false}>Evidence</Button></p>;`,
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
    mkdirSync(join(root, 'app/shared/ui/kit'), { recursive: true });
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
    writeFileSync(join(root, 'app/shared/ui/kit/control.ts'), `export {Button} from '@controls';`);
    const problems = checkLayout(root);
    for (const name of Object.keys(cases))
      expect(problems).toContain(
        `app/workflows/example/${name}.ts: presentation dependencies belong behind app/shared/ui/kit/index.ts`,
      );
    expect(problems.some((problem) => problem.includes('app/shared/ui/kit/control.ts:'))).toBe(
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module owners cannot depend on their consumers', () => {
  expect(importProblem('app/modules/agent/store.ts', 'app/core/store/identity.ts')).toContain(
    'private EAV',
  );
  expect(importProblem('app/modules/agent/store.ts', 'app/core/store/index.ts')).toBeNull();
  for (const owner of ['navigation', 'settings', 'store']) {
    expect(
      importProblem(`app/core/${owner}/core.ts`, 'app/application/composition/composition.ts'),
    ).toContain('imports Application composition');
    expect(importProblem(`app/core/${owner}/core.ts`, 'app/modules/agent/index.ts')).toContain(
      'higher-level',
    );
  }
  for (const target of [
    'navigation/routing.ts',
    'settings/store.ts',
    'search/presentation/Search.tsx',
  ])
    expect(importProblem('app/shared/ui/kit/control.tsx', `app/core/${target}`)).toContain(
      'Shared cannot depend on its consumers',
    );
  expect(
    importProblem(
      'app/application/composition/composition.ts',
      'app/modules/questions/operations.ts',
    ),
  ).toContain('private questions');
  expect(
    importProblem('app/application/connections.test.ts', 'app/modules/wiki/subjects.ts'),
  ).toBeNull();
});

test('Wiki and Questions stay independent across value, type, dynamic and import-type references', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-peer-records-'));
  try {
    const files = {
      'app/modules/wiki/records.ts': 'export const value = 1; export type Record = string;',
      'app/modules/questions/records.ts': 'export const value = 1; export type Record = string;',
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
      const path = `@/modules/${to}/records.ts`;
      const sources = [
        `import { value } from '${path}'; export { value };`,
        `export * from '${path}';`,
        `export const load = () => import('${path}');`,
        `import type { Record } from '${path}'; export type Data = Record;`,
        `export type Data = import('${path}').Record;`,
      ];
      for (const [i, source] of sources.entries())
        writeFileSync(join(root, `app/modules/${from}/case${i}.ts`), source);
    }
    const problems = checkLayout(root);
    expect(problems).toHaveLength(10);
    expect(
      problems.every(
        (problem) => problem.includes('imports private') || problem.includes('compose unrelated'),
      ),
    ).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runtime cycles include values, re-exports and dynamic imports while type cycles stay distinct', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-import-cycles-'));
  try {
    const files = {
      'app/shared/async/a.ts': "export { b } from './b.ts'; export const a = 1;",
      'app/shared/async/b.ts': "export const b = () => import('./a.ts');",
      'app/shared/async/c.ts': "import './d.ts'; export const c = 1;",
      'app/shared/async/d.ts': "import { c } from './c.ts'; export const d = c;",
      'app/shared/async/type-a.ts': "import type { B } from './type-b.ts'; export type A = B[];",
      'app/shared/async/type-b.ts': "export type B = import('./type-a.ts').A[];",
      'app/shared/async/type-c.ts': "import { type D } from './type-d.ts'; export type C = D[];",
      'app/shared/async/type-d.ts': "export { type C as D } from './type-c.ts';",
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
      'Runtime import cycle: app/shared/async/a.ts -> app/shared/async/b.ts -> app/shared/async/a.ts',
      'Runtime import cycle: app/shared/async/c.ts -> app/shared/async/d.ts -> app/shared/async/c.ts',
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

test('app-root CSS aliases preserve presentation ownership', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-css-alias-'));
  try {
    const files = {
      'app/shared/ui/kit/styles.css': '',
      'app/core/search/custom.css': '',
      'app/core/search/view.ts':
        "import '@/shared/ui/kit/styles.css'; import '@/core/search/custom.css';",
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
    expect(checkLayout(root)).toEqual([
      'app/core/search/view.ts: app styles belong in the kit or content renderer',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Calendar and Map protect private record implementation while exposing shared value entries', () => {
  expect(
    importProblem('app/modules/wiki/example.ts', 'app/modules/calendar/operations.ts'),
  ).toContain('private calendar');
  expect(importProblem('app/modules/questions/example.ts', 'app/modules/map/reading.ts')).toContain(
    'private map',
  );
  expect(importProblem('app/modules/wiki/example.ts', 'app/modules/calendar/index.ts')).toBeNull();
  expect(
    importProblem('app/application/composition/composition.ts', 'app/modules/map/records.ts'),
  ).toContain('private map');
});

test('compiler resolution protects standalone owner record behavior through public re-exports', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-owner-seams-'));
  try {
    const files = {
      'app/modules/calendar/operations.ts': 'export const createEvent = () => 1;',
      'app/modules/calendar/time.ts':
        'export const parseTime = () => 1; export interface TimeValue { day: string }',
      'app/modules/calendar/index.ts':
        "export { createEvent } from './operations.ts'; export { parseTime } from './time.ts'; export type { TimeValue } from './time.ts';",
      'app/modules/map/reading.ts': 'export const readCoordinates = () => 1;',
      'app/modules/map/index.ts': "export { readCoordinates } from './reading.ts';",
      'app/modules/wiki/allowed.ts':
        "import { parseTime, type TimeValue } from '../calendar/index.ts'; export const parse = parseTime; export type Value = TimeValue;",
      'app/modules/wiki/leak.ts':
        "import { createEvent } from '../calendar/index.ts'; export const leaked = createEvent;",
      'app/modules/questions/leak.ts':
        "import { readCoordinates } from '../map/index.ts'; export const leaked = readCoordinates;",
      'app/application/composition/composition.ts':
        "import { createEvent } from '../calendar/index.ts'; export const allowed = createEvent;",
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
    const problems = checkLayout(root);
    expect(
      problems.some((problem) =>
        problem.startsWith('app/modules/wiki/leak.ts accesses calendar record behavior'),
      ),
    ).toBe(true);
    expect(
      problems.some((problem) =>
        problem.startsWith('app/modules/questions/leak.ts accesses map record behavior'),
      ),
    ).toBe(true);
    expect(problems.filter((problem) => problem.includes('allowed.ts'))).toEqual([]);
    expect(problems.filter((problem) => problem.includes('application/composition.ts'))).toEqual(
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
