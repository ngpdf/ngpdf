import { describe, expect, it } from 'vitest';
import { checkPackFiles } from './check-pack.mjs';

const good = [
  'LICENSE',
  'README.md',
  'package.json',
  'fesm2022/ngpdf-core.mjs',
  'types/ngpdf-core.d.ts',
  'schematics/package.json',
  'schematics/collection.json',
  'schematics/ng-add/index.js',
  'schematics/ng-add/demo-route.js',
  'schematics/ng-add/schema.json',
  'schematics/ng-add/files/document/example-document.ts.template',
  'schematics/ng-add/files/demo/pdf-demo.ts.template',
];

describe('checkPackFiles', () => {
  it('accepts a package with a LICENSE, a README and no test files', () => {
    expect(checkPackFiles(good)).toEqual([]);
  });

  it('reports a missing ng add schematic', () => {
    expect(checkPackFiles(good.filter((path) => !path.startsWith('schematics/')))).toEqual([
      'schematics/package.json is missing',
      'schematics/collection.json is missing',
      'schematics/ng-add/index.js is missing',
      'schematics/ng-add/demo-route.js is missing',
      'schematics/ng-add/schema.json is missing',
      'schematics/ng-add/files/document/example-document.ts.template is missing',
      'schematics/ng-add/files/demo/pdf-demo.ts.template is missing',
    ]);
    expect(checkPackFiles(good.filter((path) => path !== 'schematics/ng-add/index.js'))).toEqual([
      'schematics/ng-add/index.js is missing',
    ]);
  });

  it('reports test files, test helpers and a missing LICENSE or README', () => {
    expect(
      checkPackFiles([
        'package.json',
        'fesm2022/ngpdf-core.mjs',
        'src/lib/engine/style.spec.ts',
        'lib/engine/paginate.bench.js',
        'fesm2022/x.spec.mjs.map',
        'testing/setup.js',
        ...good.filter((path) => path.startsWith('schematics/')),
        'schematics/ng-add/index.spec.js',
      ]),
    ).toEqual([
      'test file in the package: src/lib/engine/style.spec.ts',
      'test file in the package: lib/engine/paginate.bench.js',
      'test file in the package: fesm2022/x.spec.mjs.map',
      'test file in the package: testing/setup.js',
      'test file in the package: schematics/ng-add/index.spec.js',
      'LICENSE is missing',
      'README.md is missing',
    ]);
  });
});
