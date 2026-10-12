// Resolved import rules for removable workflows. Used by CI through tools/layout.test.ts.
import { API } from 'typescript/unstable/sync';
import * as ts from 'typescript/unstable/ast';
import { readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { compilerValues } from './compiler-values.ts';

const slash = (path: string) => path.replaceAll('\\', '/');
const contentRenderer = (path: string) =>
  path === 'app/vault/documents/notes/remark-vault-links.ts';
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
const workflow = (path: string) => /^app\/workflows\/([^/]+)\//.exec(path)?.[1];
export function importProblem(from: string, to: string): string | null {
  if (workflow(from) === 'wiki' && to.startsWith('tools/'))
    return `${from} imports tooling; migration depends on Wiki, never Wiki on migration`;
  if (
    workflow(from) === 'wiki' &&
    (workflow(to) === 'chat' ||
      to.startsWith('app/agent/') ||
      to.startsWith('app/vault/content/') ||
      to === 'app/vault/records/sources.ts')
  )
    return `${from} imports source interpretation; supply owner reading through Product composition`;
  if (kit(from) && (to.startsWith('app/vault/') || to.startsWith('app/agent/')))
    return `${from} imports record interpretation; keep Vault and Agent knowledge with its owning module`;
  const target = workflow(to);
  if (
    target &&
    from !== 'app/product.tsx' &&
    // Explicit preview-owned adapters consume public module reading and record UI interfaces.
    !(
      target === 'wiki' &&
      ['app/preview/wiki-example.tsx', 'app/preview/records.test.ts'].includes(from)
    ) &&
    workflow(from) !== target
  )
    return `${from} imports optional workflow ${target}; compose it in app/product.tsx`;
  if (kit(from) && to.startsWith('app/ui/') && !kit(to))
    return `${from} imports shared application UI ${to}; task UI belongs outside the kit`;
  if (
    to.startsWith('app/ui/kit/') &&
    !from.startsWith('app/ui/kit/') &&
    to !== 'app/ui/kit/index.ts' &&
    to !== 'app/ui/kit/styles.css'
  )
    return `${from} imports a private kit file; use app/ui/kit/index.ts`;
  if (from.startsWith('app/vault/') && to.startsWith('app/ui/'))
    return `${from} imports presentation from the vault`;
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
    for (const filename of sources(resolve(root, 'app'))) {
      const from = slash(relative(root, filename));
      const file = project.program.getSourceFile(filename);
      if (!file) {
        problems.push(`${from}: source is outside the checked TypeScript project`);
        continue;
      }
      const check = (value: ts.Expression) => {
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
          !(kit(from) || contentRenderer(from)) &&
          /\.css$/.test(value.text) &&
          target &&
          slash(relative(root, target)) !== 'app/ui/kit/styles.css' &&
          !(from === 'app/product.tsx' && contentRenderer(slash(relative(root, target))))
        )
          problems.push(`${from}: app styles belong in the kit or content renderer`);
        if (!target) return;
        const to = slash(relative(root, target));
        if (to.startsWith('app/')) {
          const dependencies = graph.get(from) ?? new Set<string>();
          dependencies.add(to);
          graph.set(from, dependencies);
        }
        const problem = importProblem(from, to);
        if (problem) problems.push(problem);
      };
      const {
        name: valueName,
        literal: intrinsic,
        member,
        propertyName,
        value: aliasValue,
        target: valueTarget,
      } = compilerValues(project);
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
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
          check(node.moduleSpecifier);
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
          node.arguments[0]
        )
          check(node.arguments[0]);
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
            !contentRenderer(from) &&
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
        // The size class is the kit's: views outside it never branch on the viewport. Product may
        // read it to choose a route or restore a panel.
        if (
          !(kit(from) || from === 'app/product.tsx' || /\.test\.[cm]?tsx?$/.test(from)) &&
          ts.isImportSpecifier(node) &&
          ['useIsMobile', 'useLayout', 'useMedia'].includes((node.propertyName ?? node.name).text)
        )
          problems.push(`${from}: size-dependent presentation belongs in the kit`);
        const outsidePresentation = !(
          kit(from) ||
          from === 'app/product.tsx' ||
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
        // Product restores a route anchor; the keyboard adapter moves the selected task row.
        // Other module/helper/semantic sources do not own measured presentation or scrolling.
        if (
          !(
            kit(from) ||
            from === 'app/product.tsx' ||
            from === 'app/ui/keys.ts' ||
            /\.test\.[cm]?tsx?$/.test(from)
          ) &&
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
    for (const entry of ['app/main.tsx', 'app/ui/sw.ts']) {
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
    return [...new Set(problems)];
  } finally {
    snapshot.dispose();
    api.close();
  }
}
