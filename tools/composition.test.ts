import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { API, SymbolFlags } from 'typescript/unstable/sync';
// biome-ignore lint/performance/noNamespaceImport: Node-only compiler inspection.
import * as ts from 'typescript/unstable/ast';
import { expect, test } from 'vitest';
import { compositions } from '../app/ui/kit/composition.ts';

// Unlike app-only layout checks, this inspects the implementation of the kit's larger surfaces.
test('Agent, Settings and their shared menu use only documented public building blocks', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const api = new API({ cwd: root });
  const snapshot = api.updateSnapshot({ openProjects: [resolve(root, 'tsconfig.json')] });
  try {
    const project = snapshot.getProjects()[0]!;
    const { checker } = project;
    const kit = project.program.getSourceFile(resolve(root, 'app/ui/kit/index.ts'))!;
    const publicTargets = new Map<string, string>();
    const key = (node: ts.Node) => {
      const symbol = checker.getSymbolAtLocation(node);
      if (!symbol) return '';
      const target = symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      return `${target.declarations[0]?.resolve()?.getSourceFile().fileName}:${target.name}`;
    };
    for (const symbol of checker.getExportsOfModule(checker.getSymbolAtLocation(kit)!)) {
      const target = symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      if (!(target.flags & SymbolFlags.Value && /^[A-Z]/.test(symbol.name))) continue;
      for (const reference of target.declarations) {
        const declaration = reference.resolve();
        if (!declaration) continue;
        publicTargets.set(`${declaration.getSourceFile().fileName}:${target.name}`, symbol.name);
        if (
          ts.isVariableDeclaration(declaration) &&
          declaration.initializer &&
          ts.isCallExpression(declaration.initializer) &&
          declaration.initializer.expression.getText() === 'unstyled'
        ) {
          const [argument] = declaration.initializer.arguments;
          if (argument) publicTargets.set(key(argument), symbol.name);
        }
      }
    }
    for (const composition of compositions) {
      const source = project.program.getSourceFile(
        resolve(root, 'app/ui/kit', composition.source),
      )!;
      const used = new Set<string>();
      const problems: string[] = [];
      const visit = (node: ts.Node) => {
        if (
          ts.isJsxAttribute(node) &&
          ['className', 'style', 'dangerouslySetInnerHTML'].includes(node.name.getText(source))
        )
          problems.push('custom presentation');
        if (
          ts.isObjectLiteralExpression(node) &&
          node.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              ['className', 'style', 'dangerouslySetInnerHTML'].includes(
                property.name.getText(source).replace(/['"]/g, ''),
              ),
          )
        )
          problems.push('custom presentation spread');
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const name = node.tagName;
          const publicName = publicTargets.get(key(name));
          if (publicName) {
            const symbol = checker.getSymbolAtLocation(name);
            const target =
              symbol &&
              (symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
            if (
              !target?.declarations.some(
                (declaration) =>
                  declaration.resolve()?.getSourceFile().fileName === source.fileName,
              )
            )
              used.add(publicName);
          } else if (ts.isIdentifier(name) && /^[a-z]/.test(name.text))
            problems.push(`intrinsic <${name.text}>`);
          else {
            // Local composition helpers are checked in the same traversal. Context providers
            // carry state only; their declaration must also belong to this source file.
            const local =
              ts.isPropertyAccessExpression(name) && name.name.text === 'Provider'
                ? name.expression
                : name;
            const symbol = checker.getSymbolAtLocation(local);
            const target =
              symbol &&
              (symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
            if (
              !target?.declarations.some(
                (declaration) =>
                  declaration.resolve()?.getSourceFile().fileName === source.fileName,
              )
            )
              problems.push(`uncatalogued <${name.getText(source)}>`);
          }
        }
        if (
          ts.isCallExpression(node) &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const symbol = checker.getSymbolAtLocation(node.expression);
          const target =
            symbol &&
            (symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
          if (['createElement', 'jsx', 'jsxs', 'jsxDEV'].includes(target?.name ?? ''))
            problems.push('intrinsic factory');
        }
        node.forEachChild(visit);
      };
      visit(source);
      expect(problems, composition.source).toEqual([]);
      expect([...used].sort(), `${composition.source} dependency list`).toEqual(
        [...composition.primitives].sort(),
      );
    }
  } finally {
    snapshot.dispose();
    api.close();
  }
});
