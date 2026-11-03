import { Version } from '@angular/core';

/**
 * The version of @ngpdf/core, in the shape of Angular's own `VERSION`.
 * `npm run changeset:version` rewrites the literal from package.json; version.spec.ts fails on drift.
 */
export const VERSION = /* @__PURE__ */ new Version('0.9.0');
