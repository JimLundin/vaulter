// Resolved import rules for removable workflows. Used by CI through tools/layout.test.ts.
import { API } from 'typescript/unstable/sync';
import * as ts from 'typescript/unstable/ast';
import { readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const slash = (path: string) => path.replaceAll('\\', '/');
const workflow = (path: string) => /^app\/workflows\/([^/]+)\//.exec(path)?.[1];
export function importProblem(from: string, to: string): string | null {
  const target = workflow(to);
  if (target && from !== 'app/product.tsx' && workflow(from) !== target)
    return `${from} imports optional workflow ${target}; compose it in app/product.tsx`;
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
          resolved ?? (value.text.startsWith('.') ? resolve(dirname(filename), value.text) : null);
        if (!target) return;
        const problem = importProblem(from, slash(relative(root, target)));
        if (problem) problems.push(problem);
      };
      const visit = (node: ts.Node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
          check(node.moduleSpecifier);
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
          node.arguments[0]
        )
          check(node.arguments[0]);
        if (workflow(from) && !from.includes('/rendering/')) {
          if (
            ts.isImportSpecifier(node) &&
            ['useIsMobile', 'useLayout', 'useMedia'].includes((node.propertyName ?? node.name).text)
          )
            problems.push(`${from}: size-dependent presentation belongs in the kit`);
          if (
            ts.isCallExpression(node) &&
            ((ts.isIdentifier(node.expression) && node.expression.text === 'matchMedia') ||
              (ts.isPropertyAccessExpression(node.expression) &&
                node.expression.name.text === 'matchMedia')) &&
            node.arguments[0] &&
            ts.isStringLiteral(node.arguments[0]) &&
            /\b(?:width|height|orientation|pointer|hover)\b/.test(node.arguments[0].text)
          )
            problems.push(`${from}: viewport queries belong in the kit`);
          if (ts.isJsxAttribute(node) && ['className', 'style'].includes(node.name.getText(file)))
            problems.push(
              `${from}: workflow views must compose the public kit instead of styling elements`,
            );
          if (
            ts.isImportDeclaration(node) &&
            ts.isStringLiteral(node.moduleSpecifier) &&
            /\.css$/.test(node.moduleSpecifier.text)
          )
            problems.push(`${from}: workflow styles belong in the kit or content renderer`);
        }
        node.forEachChild(visit);
      };
      visit(file);
    }
    return [...new Set(problems)];
  } finally {
    snapshot.dispose();
    api.close();
  }
}
