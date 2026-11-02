// Builds the ng add schematic of @ngpdf/core. ng-packagr does not build schematics: this compiles
// projects/core/schematics to CommonJS (the Angular CLI loads factories with require()) and copies
// the JSON files and file templates next to it. `npm run build:core` runs it after ng-packagr.
// Usage: node scripts/build-schematics.mjs [output directory, default dist/core/schematics]
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'projects/core/schematics');
const tsconfig = join(root, 'projects/core/tsconfig.schematics.json');

/** Builds the schematics into `outDir` and returns the path of its collection.json. */
export function buildSchematics(outDir = join(root, 'dist/core/schematics')) {
  const { config, error } = ts.readConfigFile(tsconfig, ts.sys.readFile);
  if (error) throw new Error(ts.formatDiagnostic(error, formatHost));
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, dirname(tsconfig));
  const program = ts.createProgram(parsed.fileNames, {
    ...parsed.options,
    outDir: resolve(outDir),
    noEmit: false,
    noEmitOnError: true,
    declaration: false,
    sourceMap: false,
  });
  const result = program.emit();
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics];
  if (diagnostics.length > 0) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
  }
  // The package is "type": "module", so the compiled factories need their own scope.
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'package.json'), '{\n  "type": "commonjs"\n}\n');
  // Templates end in .template, so only the TypeScript sources and specs stay behind.
  cpSync(source, outDir, { recursive: true, filter: (path) => !path.endsWith('.ts') });
  return join(outDir, 'collection.json');
}

const formatHost = {
  getCanonicalFileName: (name) => name,
  getCurrentDirectory: () => root,
  getNewLine: () => '\n',
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const collection = buildSchematics(process.argv[2]);
  console.log(`schematics: ${relative(root, collection)}`);
}
