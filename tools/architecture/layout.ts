// Resolved import rules for removable workflows. Used by CI through tools/architecture/layout.test.ts.
import { API, SymbolFlags, type Symbol as CompilerSymbol } from 'typescript/unstable/sync';
// biome-ignore lint/performance/noNamespaceImport: Node-only compiler inspection.
import * as ts from 'typescript/unstable/ast';
import { readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { compilerValues } from './compiler-values.ts';

const slash = (path: string) => path.replaceAll('\\', '/');
const semanticRenderer = (path: string) => path === 'app/workflows/wiki/rendering/blocks.tsx';
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
const chatCodeRenderer = (path: string) => path === 'app/workflows/chat/rendering/highlight.tsx';
const kit = (path: string) => path.startsWith('app/ui/kit/');
const compositionEntry = (path: string) =>
  ['app/application/index.tsx', 'app/application/composition.ts'].includes(path);
const applicationTest = (path: string) => path.startsWith('app/application/') && testSource(path);
const workflow = (path: string) => /^app\/workflows\/([^/]+)\//.exec(path)?.[1];
const fixture = (path: string) =>
  /\.(?:test|test-support)\.[cm]?tsx?$/.test(path) || path.startsWith('app/preview/');
const testSource = (path: string) => /\.(?:test|test-support)\.[cm]?tsx?$/.test(path);
const nodeImplementation = (path: string) =>
  path.startsWith('app/vault/nodes/') || path.startsWith('app/vault/storage/nodes/');
const rawNodeCaller = (path: string) =>
  path === 'app/main.tsx' || nodeImplementation(path) || fixture(path);
const rawNodeEntries = new Set([
  'app/vault/nodes/memory.ts',
  'app/vault/nodes/backend.ts',
  'app/vault/storage/nodes/github.ts',
]);
const rawNodeSymbols = new Map([
  ['app/vault/nodes/memory.ts', new Set(['memoryNodeBackend'])],
  ['app/vault/nodes/backend.ts', new Set(['nodeInterface'])],
  ['app/vault/storage/nodes/github.ts', new Set(['githubNodeBackend'])],
  ['app/vault/nodes/history.ts', new Set(['accept', 'validateRecords', 'validateRecordsAsync'])],
]);
const sessionNodeSymbols = new Map([
  ['app/vault/session/session.ts', new Set(['useSession'])],
  ['app/vault/index.ts', new Set(['useVaultSession'])],
  ['app/vault/transactions/lifetime.ts', new Set(['createTransactionSession'])],
]);
const sessionNodeCaller = (from: string, owner: string) =>
  fixture(from) ||
  (owner === 'app/vault/transactions/lifetime.ts'
    ? from === 'app/application/composition.ts' || from === 'app/vault/session/session.ts'
    : owner === 'app/vault/session/session.ts'
      ? from === 'app/application/index.tsx' ||
        from === 'app/vault/index.ts' ||
        from.startsWith('app/vault/session/')
      : from === 'app/application/index.tsx');
// These owner UI declarations compose presentation; storage/model implementations remain separate.
const vaultUi = new Set([
  'app/vault/Gate.tsx',
  'app/vault/session/ui.tsx',
  'app/vault/storage/Settings.tsx',
  'app/vault/content/tool-presentation.tsx',
  'app/vault/transactions/history/NodeHistory.tsx',
  'app/vault/transactions/history/HistoryPage.tsx',
]);
export function importProblem(from: string, to: string): string | null {
  if (from.startsWith('app/') && to.startsWith('tools/vault-check/'))
    return `${from} imports standalone vault checking; browser data uses Nodes`;
  if (to.startsWith('app/preview/') && !fixture(from))
    return `${from} imports preview-only ${to}; fixtures cannot publish application data`;
  if (testSource(to) && !fixture(from))
    return `${from} imports test-only ${to}; fixtures cannot publish application data`;
  if (rawNodeEntries.has(to) && !rawNodeCaller(from))
    return `${from} imports raw node persistence; use the Application-supplied TransactionStore`;
  if (workflow(from) === 'wiki' && to.startsWith('tools/'))
    return `${from} imports tooling; migration depends on Wiki, never Wiki on migration`;
  if (
    workflow(from) === 'wiki' &&
    (workflow(to) === 'chat' ||
      to.startsWith('app/agent/') ||
      to.startsWith('app/vault/content/') ||
      to === 'app/vault/records/sources.ts')
  )
    return `${from} imports source interpretation; supply owner reading through Application composition`;
  if (kit(from) && (to.startsWith('app/vault/') || to.startsWith('app/agent/')))
    return `${from} imports record interpretation; keep Vault and Agent knowledge with its owning module`;
  const target = workflow(to);
  if (
    target &&
    !compositionEntry(from) &&
    !applicationTest(from) &&
    // Explicit preview-owned adapters consume public module reading and record UI interfaces.
    !(
      target === 'wiki' &&
      ['app/preview/wiki-example.tsx', 'app/preview/records.test.ts'].includes(from)
    ) &&
    workflow(from) !== target
  )
    return `${from} imports optional workflow ${target}; compose it in app/application/index.tsx`;
  if (
    to.startsWith('app/application/') &&
    !from.startsWith('app/application/') &&
    from !== 'app/main.tsx' &&
    !fixture(from)
  )
    return `${from} imports Application composition; dependencies point from Application to module owners`;
  if (kit(from) && to.startsWith('app/') && !kit(to) && !to.startsWith('app/runtime/'))
    return `${from} imports application behavior ${to}; the kit owns generic presentation only`;

  if (
    to.startsWith('app/ui/kit/') &&
    !from.startsWith('app/ui/kit/') &&
    to !== 'app/ui/kit/index.ts' &&
    to !== 'app/ui/kit/styles.css'
  )
    return `${from} imports a private kit file; use app/ui/kit/index.ts`;
  if (
    from.startsWith('app/vault/') &&
    (to.startsWith('app/ui/') || to === 'app/settings/ModuleSettings.tsx') &&
    !(vaultUi.has(from) && ['app/ui/kit/index.ts', 'app/settings/ModuleSettings.tsx'].includes(to))
  )
    return `${from} imports presentation from the vault`;
  for (const [owner, allowed] of [
    ['app/runtime/', ['app/runtime/']],
    ['app/navigation/', ['app/navigation/', 'app/runtime/', 'app/ui/kit/']],
    ['app/settings/', ['app/settings/', 'app/runtime/', 'app/ui/kit/']],
    ['app/vault/nodes/', ['app/vault/nodes/', 'app/runtime/']],
  ] as const) {
    if (
      from.startsWith(owner) &&
      !fixture(from) &&
      to.startsWith('app/') &&
      !allowed.some((prefix) => to.startsWith(prefix))
    )
      return `${from} imports higher-level ${to}; keep ${owner} independent of its consumers`;
  }
  return null;
}
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.[cm]?tsx?$/.test(entry.name) ? [path] : [];
  });
}
export function checkLayout(root: string): string[] {
  const api = new API({ cwd: root });
  const snapshot = api.updateSnapshot({ openProjects: [resolve(root, 'tsconfig.json')] });
  const project = snapshot.getProjects()[0];
  if (!project) {
    api.close();
    throw new Error('No TypeScript project');
  }
  try {
    const problems: string[] = [];
    const graph = new Map<string, Set<string>>();
    const runtimeGraph = new Map<string, Set<string>>();
    for (const filename of sources(resolve(root, 'app'))) {
      const from = slash(relative(root, filename));
      if (from.startsWith('app/ui/') && !kit(from) && !fixture(from))
        problems.push(
          `${from}: app/ui contains only the kit; place application behavior with its owner`,
        );
      const file = project.program.getSourceFile(filename);
      if (!file) {
        problems.push(`${from}: source is outside the checked TypeScript project`);
        continue;
      }
      const {
        name: valueName,
        literal: intrinsic,
        member,
        propertyName,
        value: aliasValue,
        target: valueTarget,
      } = compilerValues(project);
      const checkOwnedSymbol = (symbol: CompilerSymbol | undefined, seen = new Set<number>()) => {
        if (!symbol) return;
        const owned =
          symbol.flags & SymbolFlags.Alias ? project.checker.getAliasedSymbol(symbol) : symbol;
        if (seen.has(owned.id)) return;
        seen.add(owned.id);
        for (const declaration of owned.declarations) {
          const resolvedDeclaration = declaration.resolve();
          if (!resolvedDeclaration) continue;
          const source = resolvedDeclaration.getSourceFile();
          if (ts.isVariableDeclaration(resolvedDeclaration) && resolvedDeclaration.initializer)
            checkOwnedSymbol(valueTarget(aliasValue(resolvedDeclaration.initializer)), seen);
          const owner = slash(relative(root, source.fileName));
          if (!rawNodeCaller(from) && rawNodeSymbols.get(owner)?.has(owned.name))
            problems.push(
              `${from} accesses raw node persistence; use the Application-supplied TransactionStore`,
            );
          if (sessionNodeSymbols.get(owner)?.has(owned.name) && !sessionNodeCaller(from, owner))
            problems.push(
              `${from} accesses a raw node session; use the Application-supplied TransactionStore`,
            );
          if (
            owner === 'app/workflows/questions/actions.ts' &&
            owned.name === 'createQuestionOwnership' &&
            !(
              from === 'app/application/composition.ts' ||
              workflow(from) === 'questions' ||
              fixture(from)
            )
          )
            problems.push(
              `${from} accesses Questions ownership; compose actions in app/application/composition.ts`,
            );
        }
      };
      const check = (value: ts.Expression, allExports = false, runtime = true) => {
        if (!(ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))) {
          problems.push(`${from}: imports must use literal module paths so removal can be checked`);
          return;
        }
        const symbol = project.checker.getSymbolAtLocation(value);
        const resolved = symbol?.declarations[0]?.resolve()?.getSourceFile().fileName;
        const target =
          (/\.css$/.test(value.text) && value.text.startsWith('.')
            ? resolve(dirname(filename), value.text)
            : resolved) ??
          (value.text.startsWith('.') ? resolve(dirname(filename), value.text) : null);
        if (allExports) {
          const moduleFile = target && project.program.getSourceFile(target);
          const moduleSymbol =
            symbol ?? (moduleFile && project.checker.getSymbolAtLocation(moduleFile));
          if (moduleSymbol)
            for (const exported of project.checker.getExportsOfModule(moduleSymbol))
              checkOwnedSymbol(exported);
          else
            problems.push(
              `${from}: module loading must resolve through TypeScript so ownership can be checked`,
            );
        }
        if (
          !(kit(from) || /\.test\.[cm]?tsx?$/.test(from)) &&
          (/^(?:lucide-react|radix-ui|@base-ui|cmdk|sonner)(?:\/|$)/.test(value.text) ||
            (!!target &&
              /\/node_modules\/(?:lucide-react|radix-ui|@base-ui|cmdk|sonner)(?:\/|$)/.test(
                slash(target),
              )))
        )
          problems.push(`${from}: presentation dependencies belong behind app/ui/kit/index.ts`);
        if (
          !kit(from) &&
          /\.css$/.test(value.text) &&
          target &&
          slash(relative(root, target)) !== 'app/ui/kit/styles.css'
        )
          problems.push(`${from}: app styles belong in the kit or content renderer`);
        if (!target) return;
        const to = slash(relative(root, target));
        if (to.startsWith('app/')) {
          const dependencies = graph.get(from) ?? new Set<string>();
          dependencies.add(to);
          graph.set(from, dependencies);
          if (runtime && !fixture(from) && !fixture(to) && !to.endsWith('.css')) {
            const values = runtimeGraph.get(from) ?? new Set<string>();
            values.add(to);
            runtimeGraph.set(from, values);
          }
        }
        const problem = importProblem(from, to);
        if (problem) problems.push(problem);
      };
      const semanticControl = (name: string, value?: ts.Node) =>
        /^on[A-Z]/.test(name) ||
        [
          'tabIndex',
          'contentEditable',
          'draggable',
          'aria-expanded',
          'aria-controls',
          'aria-pressed',
          'aria-checked',
          'aria-selected',
          'aria-activedescendant',
        ].includes(name) ||
        (name === 'role' &&
          ![
            'article',
            'note',
            'presentation',
            'none',
            'img',
            'document',
            'list',
            'listitem',
            'table',
            'row',
            'cell',
            'heading',
            'separator',
          ].includes(value ? (intrinsic(value) ?? '') : ''));
      const semanticProps = (expression: ts.Node, seen = new Set<string>()): boolean => {
        const node = aliasValue(expression);
        const identity = `${node.getSourceFile().fileName}:${node.pos}:${node.end}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        if (ts.isObjectLiteralExpression(node))
          return node.properties.some((property) =>
            ts.isSpreadAssignment(property)
              ? semanticProps(property.expression, seen)
              : (ts.isPropertyAssignment(property) ||
                  ts.isShorthandPropertyAssignment(property) ||
                  ts.isMethodDeclaration(property) ||
                  ts.isGetAccessorDeclaration(property) ||
                  ts.isSetAccessorDeclaration(property)) &&
                semanticControl(
                  propertyName(property.name),
                  ts.isPropertyAssignment(property) ? property.initializer : property.name,
                ),
          );
        if (ts.isCallExpression(node)) {
          const declaration = valueTarget(node.expression)?.declarations[0]?.resolve();
          if (!declaration) return false;
          const returnsControl = (child: ts.Node): boolean => {
            if (ts.isReturnStatement(child) && child.expression)
              return semanticProps(child.expression, seen);
            if (ts.isArrowFunction(child) && !ts.isBlock(child.body))
              return semanticProps(child.body, seen);
            return !!child.forEachChild(returnsControl);
          };
          return returnsControl(declaration);
        }
        return false;
      };
      const viewportDimension = (property: ReturnType<typeof member>) => {
        if (!property) return false;
        if (['innerWidth', 'innerHeight', 'outerWidth', 'outerHeight'].includes(property.name))
          return true;
        return (
          ['width', 'height'].includes(property.name) &&
          !!property.object &&
          valueName(property.object) === 'visualViewport'
        );
      };
      const visit = (node: ts.Node) => {
        // Alias initializers are visited directly; only member syntax needs compiler resolution.
        const accessedMember =
          ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node) ||
          ts.isBindingElement(node)
            ? member(node)
            : undefined;
        if (ts.isImportDeclaration(node) && node.moduleSpecifier)
          check(
            node.moduleSpecifier,
            !!node.importClause?.namedBindings &&
              ts.isNamespaceImport(node.importClause.namedBindings),
            node.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword &&
              !(
                node.importClause?.namedBindings &&
                ts.isNamedImports(node.importClause.namedBindings) &&
                !node.importClause.name &&
                node.importClause.namedBindings.elements.length > 0 &&
                node.importClause.namedBindings.elements.every((item) => item.isTypeOnly)
              ),
          );
        if (ts.isExportDeclaration(node) && node.moduleSpecifier)
          check(
            node.moduleSpecifier,
            !node.exportClause || ts.isNamespaceExport(node.exportClause),
            !(
              node.isTypeOnly ||
              (node.exportClause &&
                ts.isNamedExports(node.exportClause) &&
                node.exportClause.elements.length > 0 &&
                node.exportClause.elements.every((item) => item.isTypeOnly))
            ),
          );
        if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteral(node.argument.literal)
        )
          check(node.argument.literal, false, false);
        if (ts.isImportSpecifier(node) || ts.isExportSpecifier(node))
          checkOwnedSymbol(project.checker.getSymbolAtLocation(node.name));
        if (ts.isImportClause(node) && node.name)
          checkOwnedSymbol(project.checker.getSymbolAtLocation(node.name));
        if (
          accessedMember?.name === 'commit' &&
          accessedMember.object &&
          !(
            nodeImplementation(from) ||
            fixture(from) ||
            from === 'app/vault/transactions/lifetime.ts'
          )
        ) {
          const type = project.checker.getTypeAtLocation(accessedMember.object);
          const commit =
            type &&
            project.checker
              .getPropertiesOfType(type)
              .find((property) => property.name === 'commit');
          if (
            commit?.declarations.some((declaration) => {
              const owner = declaration.resolve()?.getSourceFile().fileName;
              return owner && slash(relative(root, owner)) === 'app/vault/nodes/store.ts';
            })
          )
            problems.push(
              `${from} accesses raw Node commit; use a TransactionStore write lifetime`,
            );
        }
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
          node.arguments[0]
        )
          check(node.arguments[0], true);
        if (!kit(from)) {
          if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const tag =
              ts.isIdentifier(node.tagName) && /^[a-z]/.test(node.tagName.text)
                ? node.tagName.text
                : intrinsic(node.tagName);
            if (
              tag &&
              (semanticRenderer(from) || chatCodeRenderer(from)) &&
              node.attributes.properties.some((attribute) =>
                ts.isJsxSpreadAttribute(attribute)
                  ? semanticProps(attribute.expression)
                  : ts.isJsxAttribute(attribute) &&
                    semanticControl(
                      attribute.name.getText(file),
                      attribute.initializer && ts.isJsxExpression(attribute.initializer)
                        ? attribute.initializer.expression
                        : attribute.initializer,
                    ),
              )
            )
              problems.push(`${from}: semantic content controls belong in public kit components`);
            if (
              tag &&
              !(chatCodeRenderer(from) && tag === 'pre') &&
              !(semanticRenderer(from) && semanticTags.has(tag))
            )
              problems.push(`${from}: <${tag}> must be a public kit component`);
          }
          if (
            ts.isJsxAttribute(node) &&
            ['className', 'style', 'dangerouslySetInnerHTML'].includes(node.name.getText(file))
          )
            problems.push(
              `${from}: app views must compose the public kit instead of styling elements`,
            );
          if (
            ts.isObjectLiteralExpression(node) &&
            node.properties.some(
              (property) =>
                (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
                ['className', 'style', 'dangerouslySetInnerHTML'].includes(
                  propertyName(property.name),
                ),
            )
          )
            problems.push(`${from}: presentation props belong in the kit or content renderer`);
          if (
            ts.isCallExpression(node) &&
            node.arguments[0] &&
            intrinsic(node.arguments[0]) &&
            ['createElement', 'jsx', 'jsxs', 'jsxDEV'].includes(valueName(node.expression)) &&
            !(
              from === 'app/workflows/chat/rendering/markdown.ts' &&
              intrinsic(node.arguments[0]) === 'p'
            )
          )
            problems.push(
              `${from}: intrinsic element factories belong in the kit or content renderer`,
            );
        }
        // The size class is the kit's: views outside it never branch on the viewport. Application may
        // read it to choose a route or restore a panel.
        if (
          !(kit(from) || from === 'app/application/index.tsx' || /\.test\.[cm]?tsx?$/.test(from)) &&
          ts.isImportSpecifier(node) &&
          ['useIsMobile', 'useLayout', 'useMedia'].includes((node.propertyName ?? node.name).text)
        )
          problems.push(`${from}: size-dependent presentation belongs in the kit`);
        const outsidePresentation = !(
          kit(from) ||
          from === 'app/application/index.tsx' ||
          /\.test\.[cm]?tsx?$/.test(from)
        );
        if (outsidePresentation && viewportDimension(accessedMember))
          problems.push(`${from}: viewport dimensions belong in the kit`);
        if (outsidePresentation && ts.isCallExpression(node)) {
          const name = valueName(node.expression);
          if (['useIsMobile', 'useLayout', 'useMedia'].includes(name))
            problems.push(`${from}: size-dependent presentation belongs in the kit`);
          if (
            name === 'matchMedia' &&
            node.arguments[0] &&
            (!intrinsic(node.arguments[0]) ||
              /\b(?:width|height|orientation|pointer|hover)\b/.test(intrinsic(node.arguments[0])!))
          )
            problems.push(`${from}: viewport queries belong in the kit`);
        }
        // Application restores a route anchor; the kit owns list focus and scrolling.
        // Other module/helper/semantic sources do not own measured presentation or scrolling.
        if (
          !(kit(from) || from === 'app/application/index.tsx' || /\.test\.[cm]?tsx?$/.test(from)) &&
          ((accessedMember &&
            [
              'scrollTop',
              'scrollLeft',
              'scrollHeight',
              'scrollWidth',
              'clientHeight',
              'clientWidth',
              'getBoundingClientRect',
              'scrollTo',
              'scrollIntoView',
            ].includes(accessedMember.name)) ||
            (ts.isNewExpression(node) && node.expression.getText(file) === 'ResizeObserver'))
        )
          problems.push(`${from}: passage measurement and scrolling belong in the kit`);
        node.forEachChild(visit);
      };
      visit(file);
    }
    // This is the architectural source graph, including type-only imports. Emitted tree shaking
    // must not hide fictional records or preview tooling in a production dependency.
    for (const entry of ['app/main.tsx', 'app/runtime/sw.ts']) {
      const visited = new Set<string>();
      const walk = (from: string) => {
        if (visited.has(from)) return;
        visited.add(from);
        for (const to of graph.get(from) ?? []) {
          if (
            to.startsWith('app/preview/') ||
            to === 'app/ui/kit/catalogue.tsx' ||
            to === 'app/ui/kit/gallery.tsx' ||
            /\/prototype-[^/]+\.[cm]?tsx?$/.test(to)
          )
            problems.push(`${entry} reaches preview-only ${to} through ${from}`);
          else walk(to);
        }
      };
      walk(entry);
    }
    // Type-only edges still obey ownership/reachability rules above, but cannot execute a cycle.
    const visited = new Set<string>();
    const active: string[] = [];
    const walkRuntime = (from: string) => {
      const start = active.indexOf(from);
      if (start !== -1) {
        problems.push(`Runtime import cycle: ${[...active.slice(start), from].join(' -> ')}`);
        return;
      }
      if (visited.has(from)) return;
      visited.add(from);
      active.push(from);
      for (const to of [...(runtimeGraph.get(from) ?? [])].sort()) walkRuntime(to);
      active.pop();
    };
    for (const from of [...runtimeGraph.keys()].sort()) walkRuntime(from);
    return [...new Set(problems)];
  } finally {
    snapshot.dispose();
    api.close();
  }
}
