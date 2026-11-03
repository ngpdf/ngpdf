// Writes the version in projects/core/package.json into projects/core/src/version.ts, so the
// `VERSION` export matches the published package. `npm run changeset:version` runs it after
// `changeset version`, so the "chore: version packages" pull request carries both.
// Usage: node scripts/sync-version.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VERSION_FILE = 'projects/core/src/version.ts';
const LITERAL = /new Version\('[^'\n]*'\)/;
// SemVer 2.0: no leading zeros in the three numbers or in a numeric prerelease identifier;
// build identifiers after `+` may have them.
const NUM = '(?:0|[1-9]\\d*)';
const PRE = `(?:${NUM}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
const BUILD = '[0-9A-Za-z-]+';
const SEMVER = new RegExp(
  `^${NUM}\\.${NUM}\\.${NUM}(?:-${PRE}(?:\\.${PRE})*)?(?:\\+${BUILD}(?:\\.${BUILD})*)?$`,
);

export function syncVersion(source, version) {
  if (!SEMVER.test(version)) throw new Error(`sync-version: "${version}" is not a version`);
  if (!LITERAL.test(source)) throw new Error('sync-version: no `new Version(...)` literal');
  return source.replace(LITERAL, `new Version('${version}')`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(readFileSync('projects/core/package.json', 'utf8'));
  writeFileSync(VERSION_FILE, syncVersion(readFileSync(VERSION_FILE, 'utf8'), version));
  console.log(`${VERSION_FILE}: ${version}`);
}
