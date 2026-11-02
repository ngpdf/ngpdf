import type { Rule } from '@angular-devkit/schematics';
import { posix } from 'node:path';
import type * as TS from 'typescript';
import { loadTypeScript } from './typescript';

/**
 * Adds a lazy `pdf-demo` route to the `routes` array of `routesFile`, before a `**` route if there
 * is one. Without that file or array it adds nothing and prints the route to add by hand.
 */
export function addDemoRoute(routesFile: string, demoFile: string): Rule {
  return (tree, context) => {
    const ts = loadTypeScript();
    let specifier = posix.relative(posix.dirname(routesFile), demoFile).replace(/\.ts$/, '');
    // A folder such as `.docs` also starts with a dot, so test for the relative prefixes.
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) specifier = `./${specifier}`;
    const load = loadComponent(ts, specifier);

    const text = tree.exists(routesFile) ? tree.readText(routesFile) : undefined;
    const routes = text === undefined ? undefined : findRoutesArray(ts, routesFile, text);
    if (text === undefined || routes === undefined) {
      context.logger.warn(
        `ngpdf: no routes array in ${routesFile}. Add this route by hand: ` +
          `{ path: 'pdf-demo', loadComponent: ${load} }`,
      );
      return;
    }
    const elements = routes.elements;
    if (!elements.every((element) => readableRoute(ts, element))) {
      // Any of these may be a wildcard that would catch pdf-demo first.
      context.logger.warn(
        `ngpdf: the routes array in ${routesFile} has routes ng add cannot read (a spread, a ` +
          `variable, a call or a path that is not a plain string), and one may be a wildcard. ` +
          `Add this route by hand, before any wildcard: ` +
          `{ path: 'pdf-demo', loadComponent: ${load} }`,
      );
      return;
    }
    if (elements.some((element) => routePath(ts, element) === 'pdf-demo')) return;

    const recorder = tree.beginUpdate(routesFile);
    const wildcard = elements.find((element) => routePath(ts, element) === '**');
    const last = elements.at(-1);
    if (last === undefined) {
      // `[]`, or an empty array spread over lines: write it again with the route in it.
      const start = routes.getStart();
      recorder.remove(start, routes.end - start);
      recorder.insertLeft(start, `[\n${route('  ', load)},\n]`);
    } else if (wildcard) {
      const indent = indentOf(text, wildcard.getStart());
      recorder.insertLeft(wildcard.getStart(), `${route(indent, load).trimStart()},\n${indent}`);
    } else {
      // Before the trailing comma, if any, which then ends the new route.
      recorder.insertLeft(last.end, `,\n${route(indentOf(text, last.getStart()), load)}`);
    }
    tree.commitUpdate(recorder);
  };
}

/**
 * `() => import(specifier).then((m) => m.PdfDemo)`. The `import()` call is built as a syntax tree
 * and printed, so the specifier is always a well-formed string literal however odd `--path` is. It
 * is single-quoted, as the CLI writes code, unless it holds a `'`.
 */
function loadComponent(ts: typeof TS, specifier: string): string {
  const dynamicImport = ts.factory.createCallExpression(
    ts.factory.createToken(ts.SyntaxKind.ImportKeyword) as TS.Expression,
    undefined,
    [ts.factory.createStringLiteral(specifier, !specifier.includes("'"))],
  );
  const file = ts.createSourceFile('routes.ts', '', ts.ScriptTarget.Latest);
  const call = ts.createPrinter().printNode(ts.EmitHint.Expression, dynamicImport, file);
  return `() => ${call}.then((m) => m.PdfDemo)`;
}

function route(indent: string, load: string): string {
  return [
    `${indent}{`,
    `${indent}  path: 'pdf-demo',`,
    `${indent}  loadComponent: ${load},`,
    `${indent}}`,
  ].join('\n');
}

/** The array a top-level `routes` variable is set to, through `as`, `satisfies` or parentheses. */
function findRoutesArray(
  ts: typeof TS,
  fileName: string,
  text: string,
): TS.ArrayLiteralExpression | undefined {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'routes') continue;
      let value = declaration.initializer;
      while (
        value &&
        (ts.isAsExpression(value) ||
          ts.isSatisfiesExpression(value) ||
          ts.isParenthesizedExpression(value))
      ) {
        value = value.expression;
      }
      if (value && ts.isArrayLiteralExpression(value)) return value;
    }
  }
  return undefined;
}

/**
 * Whether `element` is an object literal whose path, if it has one, `routePath` can read: no
 * spread inside it, and no `path` written as a shorthand, a variable or a template with `${}`.
 */
function readableRoute(ts: typeof TS, element: TS.Expression): boolean {
  if (!ts.isObjectLiteralExpression(element)) return false;
  return element.properties.every((property) => {
    if (ts.isSpreadAssignment(property)) return false;
    const name = property.name;
    const isPath = (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === 'path';
    if (!isPath) return true;
    return ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer);
  });
}

/** The string `path` of a route object literal, with its key written `path`, `'path'` or `"path"`. */
function routePath(ts: typeof TS, element: TS.Expression): string | undefined {
  if (!ts.isObjectLiteralExpression(element)) return undefined;
  for (const property of element.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === 'path' &&
      ts.isStringLiteralLike(property.initializer)
    ) {
      return property.initializer.text;
    }
  }
  return undefined;
}

/** The whitespace before `position` on its line, or two spaces when code comes first. */
function indentOf(text: string, position: number): string {
  const lineStart = text.lastIndexOf('\n', position - 1) + 1;
  const before = text.slice(lineStart, position);
  return /^[ \t]*$/.test(before) ? before : '  ';
}
