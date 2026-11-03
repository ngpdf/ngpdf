import { describe, expect, it } from 'vitest';
import { syncVersion } from './sync-version.mjs';

const source = `import { Version } from '@angular/core';

/** The version of @ngpdf/core. */
export const VERSION = /* @__PURE__ */ new Version('0.7.0');
`;

describe('syncVersion', () => {
  it('writes the package version into the source', () => {
    expect(syncVersion(source, '0.8.0')).toBe(source.replace("'0.7.0'", "'0.8.0'"));
    expect(syncVersion(source, '1.0.0-next.2')).toContain("new Version('1.0.0-next.2')");
  });

  it('leaves a source that already has the version unchanged', () => {
    expect(syncVersion(source, '0.7.0')).toBe(source);
  });

  it('throws when the source has no Version literal or the version is not semver', () => {
    expect(() => syncVersion('export const VERSION = 1;\n', '0.8.0')).toThrow(
      'sync-version: no `new Version(...)` literal',
    );
    expect(() => syncVersion(source, "0.8.0'); alert(1); ('")).toThrow(
      'sync-version: "0.8.0\'); alert(1); (\'" is not a version',
    );
  });
});
