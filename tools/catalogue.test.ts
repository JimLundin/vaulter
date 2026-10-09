import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { API, SymbolFlags } from 'typescript/unstable/sync';
// biome-ignore lint/performance/noNamespaceImport: Node-only AST inspection.
import * as ts from 'typescript/unstable/ast';
import { expect, test } from 'vitest';

test('every public kit component is catalogued and actually rendered by a sample', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const api = new API({ cwd: root });
  const snapshot = api.updateSnapshot({ openProjects: [resolve(root, 'tsconfig.json')] });
  try {
    const project = snapshot.getProjects()[0]!;
    const kit = project.program.getSourceFile(resolve(root, 'app/ui/kit/index.ts'))!;
    const source = project.program.getSourceFile(resolve(root, 'app/ui/kit/catalogue.tsx'))!;
    const names = project.checker
      .getExportsOfModule(project.checker.getSymbolAtLocation(kit)!)
      .filter((symbol) => /^[A-Z]/.test(symbol.name))
      .filter((symbol) => {
        const target =
          symbol.flags & SymbolFlags.Alias ? project.checker.getAliasedSymbol(symbol) : symbol;
        return !!(target.flags & SymbolFlags.Value);
      })
      .map((symbol) => symbol.name)
      .sort();
    expect(names.filter((name) => /^(?:Drawer|Sheet)|^MenuSheet$/.test(name))).toEqual(['Drawer']);
    const registered = new Set<string>();
    const rendered = new Set<string>();
    const ids: string[] = [];
    function visit(node: ts.Node) {
      if (
        ts.isPropertyAssignment(node) &&
        node.name.getText(source) === 'components' &&
        ts.isArrayLiteralExpression(node.initializer)
      )
        for (const item of node.initializer.elements)
          if (ts.isStringLiteral(item)) registered.add(item.text);
      if (
        ts.isPropertyAssignment(node) &&
        node.name.getText(source) === 'id' &&
        ts.isStringLiteral(node.initializer) &&
        ts.isObjectLiteralExpression(node.parent) &&
        node.parent.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) && property.name.getText(source) === 'Sample',
        )
      )
        ids.push(node.initializer.text);
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        ts.isPropertyAccessExpression(node.tagName) &&
        node.tagName.expression.getText(source) === 'K'
      )
        rendered.add(node.tagName.name.text);
      node.forEachChild(visit);
    }
    visit(source);
    expect([...registered].sort()).toEqual(names);
    expect(names.filter((name) => !rendered.has(name))).toEqual([]);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  } finally {
    snapshot.dispose();
    api.close();
  }
});
