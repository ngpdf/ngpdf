// Checks the files `npm pack` would publish from dist/core: a LICENSE, a README and the compiled
// ng add schematic, and no specs, benches or test helpers. Runs in CI after `npm run build:core`.
// Usage: node scripts/check-pack.mjs [package directory, default dist/core]
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TEST_FILE = /(?:^|\/)(?:testing\/|[^/]*\.(?:spec|bench)\.)/;
const REQUIRED = [
  'LICENSE',
  'README.md',
  'schematics/collection.json',
  'schematics/ng-add/index.js',
];

export function checkPackFiles(paths) {
  const problems = paths
    .filter((path) => TEST_FILE.test(path))
    .map((path) => `test file in the package: ${path}`);
  for (const path of REQUIRED) {
    if (!paths.includes(path)) problems.push(`${path} is missing`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2] ?? 'dist/core';
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: directory,
    encoding: 'utf8',
  });
  const paths = JSON.parse(output)[0].files.map((file) => file.path);
  const problems = checkPackFiles(paths);
  for (const problem of problems) console.error(`${directory}: ${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log(
    `${directory}: ${String(paths.length)} files, LICENSE, README and schematics, no test files`,
  );
}
