import type { Rule } from '@angular-devkit/schematics';
import { posix } from 'node:path';
import * as ts from 'typescript';

/**
 * Adds a lazy `pdf-demo` route to the `routes` array of `routesFile`, before a `**` route if there
 * is one. Without that file or array it adds nothing and prints the route to add by hand.
 */
export function addDemoRoute(routesFile: string, demoFile: string): Rule {
  return (tree, context) => {
    let specifier = posix.relative(posix.dirname(routesFile), demoFile).replace(/\.ts$/, '');
    if (!specifier.startsWith('.')) specifier = `./${specifier}`;
    const load = `() => import(${stringLiteral(specifier)}).then((m) => m.PdfDemo)`;

    const text = tree.exists(routesFile) ? tree.readText(routesFile) : undefined;
    const routes = text === undefined ? undefined : findRoutesArray(routesFile, text);
    if (text === undefined || routes === undefined) {
      context.logger.warn(
        `ngpdf: no routes array in ${routesFile}. Add this route by hand: ` +
          `{ path: 'pdf-demo', loadComponent: ${load} }`,
      );
      return;
    }
    const elements = routes.elements;
    if (elements.some((element) => routePath(element) === 'pdf-demo')) return;

    const recorder = tree.beginUpdate(routesFile);
    const wildcard = elements.find((element) => routePath(element) === '**');
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
 * `value` as a TypeScript string literal: single-quoted like the CLI's own code when nothing needs
 * escaping, otherwise JSON's double-quoted form, which escapes quotes and control characters.
 * `value` never holds a backslash: `--path` is normalized to forward slashes.
 */
function stringLiteral(value: string): string {
  return /^[^'\p{Cc}]*$/u.test(value) ? `'${value}'` : JSON.stringify(value);
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
function findRoutesArray(fileName: string, text: string): ts.ArrayLiteralExpression | undefined {
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

/** The string `path` of a route object literal. */
function routePath(element: ts.Expression): string | undefined {
  if (!ts.isObjectLiteralExpression(element)) return undefined;
  for (const property of element.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
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
