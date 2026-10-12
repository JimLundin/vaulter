// Node-only composition policy shared by CI and temporary source-project tests.
import { dirname, relative, resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { SymbolFlags, type Project, type Symbol as CompilerSymbol } from 'typescript/unstable/sync';
// biome-ignore lint/performance/noNamespaceImport: Node-only compiler inspection.
import * as ts from 'typescript/unstable/ast';
import { compilerValues } from './compiler-values.ts';

export interface CompositionRoot {
  source: string;
  primitives: readonly string[];
}
export interface ImplementationRole {
  source: string;
  /** Exact declaration boundaries allowed to own DOM/library mechanics. */
  mechanics: readonly string[];
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
  configuration: {
    publicKit: string;
    roots: readonly CompositionRoot[];
    implementations?: readonly ImplementationRole[];
  },
): CompositionResult {
  const root = dirname(project.configFileName);
  const { checker } = project;
  const publicKit = project.program.getSourceFile(resolve(root, configuration.publicKit));
  if (!publicKit) throw new Error('Public kit is outside the checked TypeScript project');
  const path = (filename: string) => relative(root, filename).replaceAll('\\', '/');
  const { target, value: aliasValue, propertyName } = compilerValues(project);
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
  const presentationFactory = (node: ts.Node): node is ts.CallExpression =>
    ts.isCallExpression(node) &&
    ['createElement', 'jsx', 'jsxs', 'jsxDEV'].includes(
      target(aliasValue(node.expression))?.name ?? '',
    );
  const containsPresentation = (node: ts.Node, seen = new Set<string>()): boolean => {
    const identity = `${node.getSourceFile().fileName}:${node.kind}:${node.pos}:${node.end}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))
      return true;
    if (presentationFactory(node)) return true;
    if (
      (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) &&
      !publicTargets.has(key(target(node))) &&
      privateDeclarations(target(node)).some((declaration) =>
        containsPresentation(declaration, seen),
      )
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
  const owned = new Map<string, Set<string>>();
  const implementationRoots: CompositionRoot[] = [];
  if (configuration.implementations) {
    const roles = new Map(configuration.implementations.map((role) => [role.source, role]));
    const scan = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = resolve(directory, entry.name);
        return entry.isDirectory() ? scan(file) : /\.[cm]?tsx?$/.test(file) ? [file] : [];
      });
    for (const filename of scan(dirname(publicKit.fileName))) {
      const source = project.program.getSourceFile(filename);
      if (!source || /\.test\.[cm]?tsx?$/.test(filename)) continue;
      const role = roles.get(path(filename));
      if (!role) {
        report(source, `unclassified implementation ${path(filename)}`);
        continue;
      }
      const names = new Set<string>();
      const boundaries = new Set<string>();
      const declaration = (node: ts.Node) => {
        if (
          (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
          node.name &&
          ts.isIdentifier(node.name)
        ) {
          if (role.mechanics.includes(node.name.text)) {
            boundaries.add(`${node.kind}:${node.pos}`);
            names.add(node.name.text);
          }
          return;
        }
        node.forEachChild(declaration);
      };
      source.forEachChild(declaration);
      for (const name of role.mechanics)
        if (!names.has(name)) report(source, `unknown mechanics declaration ${name}`);
      owned.set(filename, boundaries);
      implementationRoots.push({ source: path(filename), primitives: [] });
    }
  }
  const usages = [...configuration.roots, ...implementationRoots].map((composition, index) => {
    const source = project.program.getSourceFile(resolve(root, composition.source));
    if (!source) throw new Error(`${composition.source} is outside the checked TypeScript project`);
    const used = new Set<string>();
    const visited = new Set<string>();
    const recordApproved = (symbol: CompilerSymbol | undefined): boolean => {
      const publicName = publicTargets.get(key(symbol));
      if (!publicName) return false;
      if (
        !symbol?.declarations.some(
          (declaration) => declaration.resolve()?.getSourceFile().fileName === source.fileName,
        )
      )
        used.add(publicName);
      return true;
    };
    const followHelper = (
      name: ts.Node,
      location: ts.Node,
      reason = `uncatalogued <${name.getText(name.getSourceFile())}>`,
      seen = new Set<string>(),
    ) => {
      const resolved = target(name);
      const identity = key(resolved);
      if (recordApproved(resolved)) return;
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
    // Follow prop-producing calls only from a spread or element-factory props position.
    const visitProps = (expression: ts.Node, seen = new Set<string>()) => {
      const value = ts.isCallExpression(expression) ? expression.expression : expression;
      const identity = key(target(value));
      if (seen.has(identity)) return;
      seen.add(identity);
      for (const declaration of privateDeclarations(target(value))) {
        visit(declaration);
        const returns = (node: ts.Node) => {
          if (ts.isReturnStatement(node) && node.expression) visitProps(node.expression, seen);
          if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) visitProps(node.body, seen);
          node.forEachChild(returns);
        };
        if (ts.isVariableDeclaration(declaration) && declaration.initializer)
          visitProps(declaration.initializer, seen);
        returns(declaration);
      }
    };
    // Value references enter traversal only from returned content or an initializer;
    // discovery checks for presentation before admitting their private declarations.
    const visitPresentationValue = (expression: ts.Node) => {
      if (!publicTargets.has(key(target(expression))))
        privateDeclarations(target(expression))
          .filter((declaration) => containsPresentation(declaration))
          .forEach(visit);
      expression.forEachChild(visitPresentationValue);
    };
    const visit = (node: ts.Node) => {
      const file = node.getSourceFile();
      const identity = `${file.fileName}:${node.kind}:${node.pos}:${node.end}`;
      if (visited.has(identity) || owned.get(file.fileName)?.has(`${node.kind}:${node.pos}`))
        return;
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
            ['className', 'style', 'dangerouslySetInnerHTML'].includes(propertyName(property.name)),
        )
      )
        report(node, 'custom presentation spread');
      if (ts.isReturnStatement(node) && node.expression) visitPresentationValue(node.expression);
      if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) visitPresentationValue(node.body);
      if (ts.isVariableDeclaration(node) && node.initializer)
        visitPresentationValue(node.initializer);
      if (ts.isJsxSpreadAttribute(node) || ts.isSpreadAssignment(node)) {
        visitProps(node.expression);
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = node.tagName;
        const resolved = target(name);
        if (recordApproved(resolved)) {
          node.forEachChild(visit);
          return;
        }
        const value = aliasValue(name);
        if (ts.isIdentifier(name) && /^[a-z]/.test(name.text))
          report(node, `intrinsic <${name.text}>`);
        else if (ts.isStringLiteral(value)) report(node, `intrinsic <${value.text}>`);
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
      if (presentationFactory(node)) {
        const [argument, props] = node.arguments;
        if (props) visitProps(props);
        if (argument && ts.isStringLiteral(aliasValue(argument))) report(node, 'intrinsic factory');
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
    if (
      index < configuration.roots.length &&
      JSON.stringify(primitives) !== JSON.stringify([...composition.primitives].sort())
    )
      report(
        source,
        `building-block metadata: expected ${composition.primitives.join(', ')}; used ${primitives.join(', ')}`,
      );
    return { source: composition.source, primitives };
  });
  return {
    violations: [...violations.values()],
    usages: usages.slice(0, configuration.roots.length),
  };
}
