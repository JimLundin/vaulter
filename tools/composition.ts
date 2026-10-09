// Node-only composition policy shared by CI and temporary source-project tests.
import { dirname, relative, resolve } from 'node:path';
import { SymbolFlags, type Project, type Symbol as CompilerSymbol } from 'typescript/unstable/sync';
// biome-ignore lint/performance/noNamespaceImport: Node-only compiler inspection.
import * as ts from 'typescript/unstable/ast';

export interface CompositionRoot {
  source: string;
  primitives: readonly string[];
}
export interface CompositionViolation {
  source: string;
  line: number;
  column: number;
  reason: string;
}
export interface CompositionResult {
  violations: CompositionViolation[];
  usages: CompositionRoot[];
}

export function checkCompositions(
  project: Project,
  configuration: { publicKit: string; roots: readonly CompositionRoot[] },
): CompositionResult {
  const root = dirname(project.configFileName);
  const { checker } = project;
  const publicKit = project.program.getSourceFile(resolve(root, configuration.publicKit));
  if (!publicKit) throw new Error('Public kit is outside the checked TypeScript project');
  const path = (filename: string) => relative(root, filename).replaceAll('\\', '/');
  const target = (node: ts.Node): CompilerSymbol | undefined => {
    const symbol = checker.getSymbolAtLocation(node);
    return symbol?.flags && symbol.flags & SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  };
  const key = (symbol: CompilerSymbol | undefined) => (symbol ? String(symbol.id) : '');
  const publicTargets = new Map<string, string>();
  for (const symbol of checker.getExportsOfModule(checker.getSymbolAtLocation(publicKit)!)) {
    const resolved = symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    if (!(resolved.flags & SymbolFlags.Value && /^[A-Z]/.test(symbol.name))) continue;
    publicTargets.set(key(resolved), symbol.name);
    for (const reference of resolved.declarations) {
      const declaration = reference.resolve();
      if (
        declaration &&
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        ts.isCallExpression(declaration.initializer) &&
        target(declaration.initializer.expression)?.name === 'unstyled'
      ) {
        const [argument] = declaration.initializer.arguments;
        const wrapped = argument && target(argument);
        if (wrapped && !checker.isUnknownSymbol(wrapped))
          publicTargets.set(key(wrapped), symbol.name);
      }
    }
  }
  const violations = new Map<string, CompositionViolation>();
  const report = (node: ts.Node, reason: string) => {
    const source = node.getSourceFile();
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    const violation = {
      source: path(source.fileName),
      line: position.line + 1,
      column: position.character + 1,
      reason,
    };
    violations.set(`${source.fileName}:${node.pos}:${reason}`, violation);
  };
  const privateDeclarations = (symbol: CompilerSymbol | undefined) =>
    symbol?.declarations.flatMap((reference) => {
      const declaration = reference.resolve();
      return declaration &&
        path(declaration.getSourceFile().fileName).startsWith(
          `${path(dirname(publicKit.fileName))}/`,
        ) &&
        !declaration.getSourceFile().isDeclarationFile &&
        !project.program.isSourceFileFromExternalLibrary(declaration.getSourceFile())
        ? [declaration]
        : [];
    }) ?? [];
  const containsPresentation = (node: ts.Node, seen = new Set<string>()): boolean => {
    const identity = `${node.getSourceFile().fileName}:${node.kind}:${node.pos}:${node.end}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))
      return true;
    if (
      ts.isCallExpression(node) &&
      ['createElement', 'jsx', 'jsxs', 'jsxDEV'].includes(target(node.expression)?.name ?? '')
    )
      return true;
    if (
      ts.isCallExpression(node) &&
      privateDeclarations(target(node.expression)).some((declaration) =>
        containsPresentation(declaration, seen),
      )
    )
      return true;
    return !!node.forEachChild((child) => containsPresentation(child, seen));
  };
  const usages = configuration.roots.map((composition) => {
    const source = project.program.getSourceFile(resolve(root, composition.source));
    if (!source) throw new Error(`${composition.source} is outside the checked TypeScript project`);
    const used = new Set<string>();
    const visited = new Set<string>();
    const followHelper = (
      name: ts.Node,
      location: ts.Node,
      reason = `uncatalogued <${name.getText(name.getSourceFile())}>`,
      seen = new Set<string>(),
    ) => {
      const resolved = target(name);
      const identity = key(resolved);
      const publicName = publicTargets.get(identity);
      if (publicName) {
        if (
          !resolved?.declarations.some(
            (declaration) => declaration.resolve()?.getSourceFile().fileName === source.fileName,
          )
        )
          used.add(publicName);
        return;
      }
      if (seen.has(identity)) return;
      seen.add(identity);
      const declarations = privateDeclarations(resolved);
      if (!declarations.length) {
        report(location, reason);
        return;
      }
      for (const declaration of declarations) {
        if (ts.isFunctionDeclaration(declaration) && declaration.body) visit(declaration);
        else if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          const value = declaration.initializer;
          if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) visit(declaration);
          else if (ts.isIdentifier(value) || ts.isPropertyAccessExpression(value))
            followHelper(value, location, reason, seen);
          else report(location, reason);
        } else report(location, reason);
      }
    };
    const visitProps = (expression: ts.Node, seen = new Set<string>()) => {
      const identity = key(target(expression));
      if (seen.has(identity)) return;
      seen.add(identity);
      for (const declaration of privateDeclarations(target(expression))) {
        visit(declaration);
        if (ts.isVariableDeclaration(declaration) && declaration.initializer)
          visitProps(declaration.initializer, seen);
      }
    };
    const visit = (node: ts.Node) => {
      const file = node.getSourceFile();
      const identity = `${file.fileName}:${node.kind}:${node.pos}:${node.end}`;
      if (visited.has(identity)) return;
      visited.add(identity);
      if (
        ts.isJsxAttribute(node) &&
        ['className', 'style', 'dangerouslySetInnerHTML'].includes(node.name.getText(file))
      )
        report(node, 'custom presentation');
      if (
        ts.isObjectLiteralExpression(node) &&
        node.properties.some(
          (property) =>
            (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
            ['className', 'style', 'dangerouslySetInnerHTML'].includes(
              property.name.getText(file).replace(/['"]/g, ''),
            ),
        )
      )
        report(node, 'custom presentation spread');
      if (ts.isJsxSpreadAttribute(node) || ts.isSpreadAssignment(node)) {
        visitProps(node.expression);
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = node.tagName;
        const resolved = target(name);
        const publicName = publicTargets.get(key(resolved));
        if (publicName) {
          if (
            !resolved?.declarations.some(
              (declaration) => declaration.resolve()?.getSourceFile().fileName === source.fileName,
            )
          )
            used.add(publicName);
        } else if (ts.isIdentifier(name) && /^[a-z]/.test(name.text))
          report(node, `intrinsic <${name.text}>`);
        else {
          const provider = ts.isPropertyAccessExpression(name) && name.name.text === 'Provider';
          const declarations = provider
            ? privateDeclarations(target(name.expression)).filter(
                (declaration) =>
                  ts.isVariableDeclaration(declaration) &&
                  declaration.initializer &&
                  ts.isCallExpression(declaration.initializer) &&
                  target(declaration.initializer.expression)?.name === 'createContext' &&
                  target(declaration.initializer.expression)?.declarations.some((reference) =>
                    /\/node_modules\/(?:@types\/)?react\//.test(
                      reference.resolve()?.getSourceFile().fileName ?? '',
                    ),
                  ),
              )
            : privateDeclarations(target(name));
          if (provider) {
            if (declarations.length) declarations.forEach(visit);
            else report(node, `uncatalogued <${name.getText(file)}>`);
          } else followHelper(name, node);
        }
      }
      if (
        ts.isCallExpression(node) &&
        ['createElement', 'jsx', 'jsxs', 'jsxDEV'].includes(target(node.expression)?.name ?? '')
      ) {
        const [argument, props] = node.arguments;
        if (props) visitProps(props);
        if (argument && ts.isStringLiteral(argument)) report(node, 'intrinsic factory');
        else if (argument)
          followHelper(
            argument,
            node,
            `uncatalogued presentation target ${argument.getText(file)}`,
          );
      }
      if (ts.isCallExpression(node) && !publicTargets.has(key(target(node.expression))))
        privateDeclarations(target(node.expression))
          .filter((declaration) => containsPresentation(declaration))
          .forEach(visit);
      node.forEachChild(visit);
    };
    visit(source);
    const primitives = [...used].sort();
    if (JSON.stringify(primitives) !== JSON.stringify([...composition.primitives].sort()))
      report(
        source,
        `building-block metadata: expected ${composition.primitives.join(', ')}; used ${primitives.join(', ')}`,
      );
    return { source: composition.source, primitives };
  });
  return { violations: [...violations.values()], usages };
}
