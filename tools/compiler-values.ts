// Private compiler syntax/value resolution; callers retain their own ownership policy.
import { SymbolFlags, type Project } from 'typescript/unstable/sync';
// biome-ignore lint/performance/noNamespaceImport: Node-only compiler inspection.
import * as ts from 'typescript/unstable/ast';

export function compilerValues(project: Project) {
  const { checker } = project;
  const target = (node: ts.Node) => {
    const symbol = checker.getSymbolAtLocation(node);
    return symbol && (symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  };
  const value = (node: ts.Node, seen = new Set<number>()): ts.Node => {
    if (
      ts.isAsExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    )
      return value(node.expression, seen);
    const symbol = target(node);
    if (!symbol || seen.has(symbol.id)) return node;
    seen.add(symbol.id);
    const declaration = symbol.declarations[0]?.resolve();
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer)
      return value(declaration.initializer, seen);
    return node;
  };
  const propertyName = (node: ts.Node): string => {
    if (ts.isComputedPropertyName(node)) return literal(node.expression) ?? '';
    return ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)
      ? node.text
      : '';
  };
  const literal = (node: ts.Node): string | undefined => {
    const resolved = value(node);
    return ts.isStringLiteral(resolved) || ts.isNoSubstitutionTemplateLiteral(resolved)
      ? resolved.text
      : undefined;
  };
  const member = (node: ts.Node): { name: string; object?: ts.Node } | undefined => {
    if (ts.isPropertyAccessExpression(node))
      return { name: node.name.text, object: node.expression };
    if (ts.isElementAccessExpression(node) && node.argumentExpression)
      return { name: literal(node.argumentExpression) ?? '', object: node.expression };
    const resolved = value(node);
    if (resolved !== node) return member(resolved);
    const declaration = ts.isBindingElement(resolved)
      ? resolved
      : target(resolved)?.declarations[0]?.resolve();
    if (declaration && ts.isBindingElement(declaration)) {
      const binding = declaration.parent.parent;
      const property = declaration.propertyName ?? declaration.name;
      return {
        name: property ? propertyName(property) : '',
        object: ts.isVariableDeclaration(binding) ? binding.initializer : undefined,
      };
    }
    return undefined;
  };
  const name = (node: ts.Node): string => {
    const resolved = value(node);
    return (
      member(resolved)?.name ??
      target(resolved)?.name ??
      (ts.isIdentifier(resolved) ? resolved.text : '')
    );
  };
  return { target, value, literal, member, name, propertyName };
}
