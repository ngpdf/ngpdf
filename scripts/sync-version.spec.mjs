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
    expect(syncVersion(source, '1.0.0-next-major.0+build-7')).toContain(
      "new Version('1.0.0-next-major.0+build-7')",
    );
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
    for (const version of ['01.2.3', '1.02.3', '1.2.03', '1.2.3-01', '1.2.3-rc.01']) {
      expect(() => syncVersion(source, version)).toThrow(
        `sync-version: "${version}" is not a version`,
      );
    }
    expect(syncVersion(source, '1.2.3-0.rc.10+001')).toContain("new Version('1.2.3-0.rc.10+001')");
  });
});
