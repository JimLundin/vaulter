// Resolved import rules for removable workflows. Used by CI through tools/architecture/layout.test.ts.
import { API, SymbolFlags, type Symbol as CompilerSymbol } from 'typescript/unstable/sync';
// biome-ignore lint/performance/noNamespaceImport: Node-only compiler inspection.
import * as ts from 'typescript/unstable/ast';
import { readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { compilerValues } from './compiler-values.ts';

const slash = (path: string) => path.replaceAll('\\', '/');
const semanticRenderer = (path: string) =>
  path === 'app/modules/wiki/presentation/rendering/blocks.tsx';
const semanticTags = new Set([
  'section',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'span',
  'mark',
  'strong',
  'em',
  'code',
  's',
  'a',
  'ol',
  'ul',
  'li',
  'blockquote',
  'table',
  'tbody',
  'tr',
  'td',
  'pre',
  'hr',
  'figure',
  'figcaption',
]);
// Chat permits semantic code markup, never a renderer-wide presentation exemption.
const chatCodeRenderer = (path: string) =>
  path === 'app/modules/conversation/presentation/rendering/highlight.tsx';
const kit = (path: string) => path.startsWith('app/shared/ui/kit/');
const compositionEntry = (path: string) =>
  [
    'app/application/presentation/index.tsx',
    'app/application/composition/composition.ts',
    'app/application/composition/database.ts',
    'app/application/composition/wiki-graph.ts',
  ].includes(path);
const applicationTest = (path: string) => path.startsWith('app/application/') && testSource(path);
const workflow = (path: string) =>
  /^app\/modules\/(conversation|wiki|questions|graph)\//.exec(path)?.[1] ??
  /^app\/workflows\/([^/]+)\//.exec(path)?.[1];
