import { SchematicTestRunner, type UnitTestTree } from '@angular-devkit/schematics/testing';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { check } from 'prettier';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildSchematics } from '../../../../scripts/build-schematics.mjs';
import type { Schema } from './schema';

const repo = resolve(import.meta.dirname, '../../../..');
// Specs run the compiled schematics, as `ng add` does: the CLI loads factories with require().
const out = join(repo, 'out-tsc/schematics-spec');

const documentPath = '/projects/app/src/app/documents/example-document.ts';
const demoPath = '/projects/app/src/app/documents/pdf-demo.ts';
const routesPath = '/projects/app/src/app/app.routes.ts';

let runner: SchematicTestRunner;

beforeAll(() => {
  rmSync(out, { recursive: true, force: true });
  const collection = buildSchematics(out);
  runner = new SchematicTestRunner('@ngpdf/core', collection);
}, 60_000);

async function workspace(): Promise<UnitTestTree> {
  return runner.runExternalSchematic('@schematics/angular', 'workspace', {
    name: 'workspace',
    newProjectRoot: 'projects',
    version: '22.0.0',
  });
}

async function application(
  tree: UnitTestTree,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<UnitTestTree> {
  return runner.runExternalSchematic(
    '@schematics/angular',
    'application',
    { name, skipTests: true, ...extra },
    tree,
  );
}

async function ngAdd(tree: UnitTestTree, options: Partial<Schema> = {}): Promise<UnitTestTree> {
  return runner.runSchematic('ng-add', options, tree);
}

function logs(): string[] {
  const lines: string[] = [];
  runner.logger.subscribe((entry) => lines.push(entry.message));
  return lines;
}

/** Whether the files are formatted as the workspace's own .prettierrc, from `ng new`, asks. */
async function formatted(tree: UnitTestTree, ...paths: string[]): Promise<boolean[]> {
  const config = JSON.parse(tree.readContent('/.prettierrc')) as Record<string, unknown>;
  return Promise.all(
    paths.map((path) => check(tree.readContent(path), { ...config, filepath: path })),
  );
}

/** The values of the string literals passed to `import()` in `source`, as TypeScript reads them. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) specifiers.push(argument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile('routes.ts', source, ts.ScriptTarget.Latest, true));
  return specifiers;
}

/**
 * Writes the tree to disk and compiles the project with the Angular compiler and the workspace's
 * own tsconfig (strict, strictTemplates), with `@ngpdf/core` mapped to this repository's sources.
 */
async function compile(tree: UnitTestTree, project: string): Promise<string[]> {
  const root = join(out, 'workspace');
  rmSync(root, { recursive: true, force: true });
  for (const file of tree.files) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, tree.readContent(file));
  }
  const { performCompilation, readConfiguration, formatDiagnostics } =
    await import('@angular/compiler-cli');
  const config = readConfiguration(join(root, project, 'tsconfig.app.json'));
  const { diagnostics } = performCompilation({
    rootNames: config.rootNames,
    options: {
      ...config.options,
      noEmit: true,
      paths: { '@ngpdf/core': [join(repo, 'projects/core/src/public-api.ts')] },
    },
  });
  return diagnostics.length === 0 ? [] : [formatDiagnostics(diagnostics)];
}

describe('ng-add', () => {
  it('adds an example document to the only application, which compiles', async () => {
    const tree = await ngAdd(await application(await workspace(), 'app'));

    const source = tree.readContent(documentPath);
    expect(source).toContain(`from '@ngpdf/core'`);
    expect(source).toContain(`selector: 'app-example-document'`);
    expect(source).toContain('export class ExampleDocument');
    expect(source).toContain('input.required<string>()');
    expect(source).toContain('@for (');
    for (const element of ['pdf-document', 'pdf-page', 'pdf-table', 'pdf-page-number']) {
      expect(source).toContain(`<${element}`);
    }
    expect(source).not.toContain('standalone');
    expect(source).not.toContain('<%');
    expect(tree.exists(demoPath)).toBe(false);
    expect(tree.readContent(routesPath)).not.toContain('pdf-demo');
    expect(await formatted(tree, documentPath)).toEqual([true]);
    expect(await compile(tree, 'projects/app')).toEqual([]);
  }, 120_000);

  it('uses the project prefix in the selector', async () => {
    const tree = await ngAdd(await application(await workspace(), 'app', { prefix: 'acme' }));

    expect(tree.readContent(documentPath)).toContain(`selector: 'acme-example-document'`);
  });

  it('writes to --path', async () => {
    const tree = await ngAdd(await application(await workspace(), 'app'), {
      path: './projects/app/src/app/pdf/',
    });

    expect(tree.exists('/projects/app/src/app/pdf/example-document.ts')).toBe(true);
    expect(tree.exists(documentPath)).toBe(false);
  });

  it('adds to the --project it is given when there are several applications', async () => {
    const tree = await application(await application(await workspace(), 'first'), 'second');

    const result = await ngAdd(tree, { project: 'second' });

    expect(result.exists('/projects/second/src/app/documents/example-document.ts')).toBe(true);
    expect(result.exists('/projects/first/src/app/documents/example-document.ts')).toBe(false);
  });

  it('asks for --project when there are several applications', async () => {
    const tree = await application(await application(await workspace(), 'first'), 'second');

    await expect(ngAdd(tree)).rejects.toThrow(
      'ngpdf: the workspace has several applications (first, second). Run ng add again with --project <name>.',
    );
  });

  it('picks the only application when the workspace also has a library', async () => {
    const withLibrary = await runner.runExternalSchematic(
      '@schematics/angular',
      'library',
      { name: 'lib', skipInstall: true },
      await application(await workspace(), 'app'),
    );

    const tree = await ngAdd(withLibrary);

    expect(tree.exists(documentPath)).toBe(true);
  });

  it('refuses a library project', async () => {
    const tree = await runner.runExternalSchematic(
      '@schematics/angular',
      'library',
      { name: 'lib', skipInstall: true },
      await application(await workspace(), 'app'),
    );

    await expect(ngAdd(tree, { project: 'lib' })).rejects.toThrow(
      'ngpdf: "lib" is a library. ng add @ngpdf/core adds an example to an application: pass --project <application>.',
    );
  });

  it('refuses a project that does not exist', async () => {
    const tree = await application(await workspace(), 'app');

    await expect(ngAdd(tree, { project: 'nope' })).rejects.toThrow(
      'ngpdf: the workspace has no project "nope".',
    );
  });

  it('never overwrites a file that is already there, and adds no route to it', async () => {
    const tree = await application(await workspace(), 'app');
    const routes = tree.readContent(routesPath);
    tree.create(demoPath, '// mine\n');
    const lines = logs();

    const result = await ngAdd(tree, { demoRoute: true });

    expect(result.readContent(demoPath)).toBe('// mine\n');
    expect(result.readContent(routesPath)).toBe(routes);
    expect(lines).toContain(`ngpdf: ${demoPath.slice(1)} already exists, skipped.`);
    expect(lines).toContain(
      `ngpdf: no pdf-demo route added: it imports PdfDemo, and ` +
        `${demoPath.slice(1)} was already there, so it may not export it.`,
    );
    expect(result.exists(documentPath)).toBe(true);
  });

  it('says only that the example document was skipped when there is no --demo-route', async () => {
    const tree = await application(await workspace(), 'app');
    tree.create(documentPath, '// mine\n');
    const lines = logs();

    await ngAdd(tree);

    expect(lines).toEqual([`ngpdf: ${documentPath.slice(1)} already exists, skipped.`]);
  });

  it('adds no demo page or route when the example document is already there', async () => {
    const tree = await application(await workspace(), 'app');
    const routes = tree.readContent(routesPath);
    tree.create(documentPath, '// mine\n');
    const lines = logs();

    const result = await ngAdd(tree, { demoRoute: true });

    expect(result.readContent(documentPath)).toBe('// mine\n');
    expect(result.exists(demoPath)).toBe(false);
    expect(result.readContent(routesPath)).toBe(routes);
    expect(lines).toContain(`ngpdf: ${documentPath.slice(1)} already exists, skipped.`);
    expect(lines).toContain(
      `ngpdf: no demo page or route added: pdf-demo.ts imports ExampleDocument, and ` +
        `${documentPath.slice(1)} was already there, so it may not export it.`,
    );
  });

  describe('--demo-route', () => {
    it('adds a demo page and a lazy route to app.routes.ts, which compile', async () => {
      const tree = await ngAdd(await application(await workspace(), 'app'), { demoRoute: true });

      const demo = tree.readContent(demoPath);
      expect(demo).toContain('PdfDownload');
      expect(demo).toContain('[pdfDownload]="exampleDocument"');
      expect(demo).toContain(`selector: 'app-pdf-demo'`);
      expect(demo).toContain('export class PdfDemo');
      expect(tree.readContent(routesPath)).toBe(
        `import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'pdf-demo',
    loadComponent: () => import('./documents/pdf-demo').then((m) => m.PdfDemo),
  },
];
`,
      );
      expect(await formatted(tree, demoPath, routesPath)).toEqual([true, true]);
      expect(await compile(tree, 'projects/app')).toEqual([]);
    }, 120_000);

    it('adds the route after the existing ones and before a wildcard', async () => {
      const tree = await application(await workspace(), 'app');
      tree.overwrite(
        routesPath,
        `import { Routes } from '@angular/router';
import { Home } from './home';
import { NotFound } from './not-found';

export const routes: Routes = [
  { path: '', component: Home },
  { path: '**', component: NotFound },
];
`,
      );

      const result = await ngAdd(tree, { demoRoute: true, path: '/projects/app/src/pdf/' });

      expect(result.readContent(routesPath)).toBe(
        `import { Routes } from '@angular/router';
import { Home } from './home';
import { NotFound } from './not-found';

export const routes: Routes = [
  { path: '', component: Home },
  {
    path: 'pdf-demo',
    loadComponent: () => import('../pdf/pdf-demo').then((m) => m.PdfDemo),
  },
  { path: '**', component: NotFound },
];
`,
      );
    });

    it('writes an import that parses and resolves when --path has a quote in it', async () => {
      const tree = await ngAdd(await application(await workspace(), 'app'), {
        demoRoute: true,
        path: "projects/app/src/app/client's-documents",
      });

      const routes = tree.readContent(routesPath);
      expect(routes).toContain(
        `loadComponent: () => import("./client's-documents/pdf-demo").then((m) => m.PdfDemo),`,
      );
      expect(importSpecifiers(routes)).toEqual([`./client's-documents/pdf-demo`]);
      const { diagnostics } = ts.transpileModule(routes, { reportDiagnostics: true });
      expect(diagnostics).toEqual([]);
      expect(await formatted(tree, routesPath)).toEqual([true]);
      expect(await compile(tree, 'projects/app')).toEqual([]);
    }, 120_000);

    it.each([
      ['a newline', 'odd\nname'],
      ['a backtick and ${', 'a`b${c}'],
      ['</script>', 'x</script>y'],
    ])('writes %s in --path as an inert string literal', async (_, folder) => {
      const tree = await ngAdd(await application(await workspace(), 'app'), {
        demoRoute: true,
        path: `projects/app/src/app/${folder}`,
      });

      const routes = tree.readContent(routesPath);
      const { diagnostics } = ts.transpileModule(routes, { reportDiagnostics: true });
      expect(diagnostics).toEqual([]);
      expect(importSpecifiers(routes)).toEqual([`./${folder}/pdf-demo`]);
    });

    it('finds a routes array behind satisfies', async () => {
      const tree = await application(await workspace(), 'app');
      tree.overwrite(
        routesPath,
        `import { Routes } from '@angular/router';\n\nexport const routes = [] satisfies Routes;\n`,
      );

      const result = await ngAdd(tree, { demoRoute: true });

      expect(result.readContent(routesPath)).toContain(`path: 'pdf-demo'`);
    });

    it('does not add the route twice', async () => {
      const once = await ngAdd(await application(await workspace(), 'app'), { demoRoute: true });
      const routes = once.readContent(routesPath);

      const twice = await ngAdd(once, { demoRoute: true });

      expect(twice.readContent(routesPath)).toBe(routes);
    });

    it('prints the route to add by hand when there is no app.routes.ts', async () => {
      const tree = await application(await workspace(), 'app', { routing: false });
      const lines = logs();

      const result = await ngAdd(tree, { demoRoute: true });

      expect(result.exists(demoPath)).toBe(true);
      expect(result.exists(routesPath)).toBe(false);
      expect(lines).toContain(
        `ngpdf: no routes array in ${routesPath.slice(1)}. Add this route by hand: ` +
          `{ path: 'pdf-demo', loadComponent: () => import('./documents/pdf-demo').then((m) => m.PdfDemo) }`,
      );
    });

    it('prints the route to add by hand when app.routes.ts has no routes array', async () => {
      const tree = await application(await workspace(), 'app');
      const custom = `import { Routes } from '@angular/router';\n\nexport default [] satisfies Routes;\n`;
      tree.overwrite(routesPath, custom);
      const lines = logs();

      const result = await ngAdd(tree, { demoRoute: true });

      expect(result.readContent(routesPath)).toBe(custom);
      expect(lines.some((line) => line.startsWith('ngpdf: no routes array in'))).toBe(true);
    });
  });
});
