import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findStaticEngineImports } from './bundle-budget.mjs';

const ENGINE = 'ngpdf-core-engine-AbC123.mjs';
const EXPORTS = {
  '.': { default: './fesm2022/ngpdf-core.mjs' },
  './viewer': { default: './fesm2022/ngpdf-core-viewer.mjs' },
  './server': { default: './fesm2022/ngpdf-core-server.mjs' },
  './package.json': { default: './package.json' },
};

// A dist/core with the given fesm2022 files and exports.
const packages = [];
function makePackage(files, exports = EXPORTS) {
  const packageDir = mkdtempSync(join(tmpdir(), 'bundle-budget-'));
  packages.push(packageDir);
  mkdirSync(join(packageDir, 'fesm2022'));
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ exports }));
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(packageDir, 'fesm2022', name), source);
  }
  return packageDir;
}

// The package as ng-packagr builds it: the engine is reached only through import().
const lazy = {
  'ngpdf-core.mjs': [
    "import { inject } from '@angular/core';",
    "import { shared } from './ngpdf-core-node-x1.mjs';",
    `const engine = () => import('./${ENGINE}');`,
    'export { engine, inject, shared };',
  ].join('\n'),
  'ngpdf-core-node-x1.mjs': 'export const shared = 1;',
  'ngpdf-core-viewer.mjs': "import { PdfRenderer } from '@ngpdf/core';\nexport { PdfRenderer };",
  'ngpdf-core-server.mjs': "export { renderTree } from '@ngpdf/core';",
  [ENGINE]: [
    "import PDFDocument from 'pdfkit';",
    "import LineBreaker from 'linebreak';",
    "import { shared } from './ngpdf-core-node-x1.mjs';",
    'export { PDFDocument, LineBreaker, shared };',
  ].join('\n'),
};

afterEach(() => {
  for (const packageDir of packages.splice(0)) rmSync(packageDir, { recursive: true, force: true });
});

describe('findStaticEngineImports', () => {
  it('accepts an engine chunk that is only imported lazily', () => {
    expect(findStaticEngineImports(makePackage(lazy))).toEqual([]);
  });

  it('reports a static import of the engine chunk from a secondary entry point', () => {
    const packageDir = makePackage({
      ...lazy,
      'ngpdf-core-viewer.mjs': `import './${ENGINE}';\n${lazy['ngpdf-core-viewer.mjs']}`,
    });
    expect(findStaticEngineImports(packageDir)).toEqual([
      `ngpdf-core-viewer.mjs: ${ENGINE} (the engine chunk)`,
      `ngpdf-core-viewer.mjs: pdfkit (imported by ${ENGINE})`,
      `ngpdf-core-viewer.mjs: linebreak (imported by ${ENGINE})`,
    ]);
  });

  it('reports an engine package imported by a chunk an entry point reaches', () => {
    const packageDir = makePackage({
      ...lazy,
      'ngpdf-core-node-x1.mjs': "import Yoga from 'yoga-layout/load';\nexport const shared = Yoga;",
      'ngpdf-core-server.mjs': "export { shared } from './ngpdf-core-node-x1.mjs';",
    });
    expect(findStaticEngineImports(packageDir)).toEqual([
      'ngpdf-core.mjs: yoga-layout/load (imported by ngpdf-core-node-x1.mjs)',
      'ngpdf-core-server.mjs: yoga-layout/load (imported by ngpdf-core-node-x1.mjs)',
    ]);
  });

  it('throws without a separate engine chunk', () => {
    const withoutEngine = { ...lazy };
    delete withoutEngine[ENGINE];
    expect(() => findStaticEngineImports(makePackage(withoutEngine))).toThrow(
      /^no engine chunk in .*fesm2022$/,
    );
  });

  it('throws when the main entry point or an exported file is missing', () => {
    const withoutMain = { ...EXPORTS };
    delete withoutMain['.'];
    expect(() => findStaticEngineImports(makePackage(lazy, withoutMain))).toThrow(
      /^no ngpdf-core\.mjs in the exports of /,
    );
    const withoutServer = { ...lazy };
    delete withoutServer['ngpdf-core-server.mjs'];
    expect(() => findStaticEngineImports(makePackage(withoutServer))).toThrow(
      /^no .*ngpdf-core-server\.mjs$/,
    );
  });
});
