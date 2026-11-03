// Bundle budget, measured on the built package in dist/core, as an app gets it from npm:
// importing @ngpdf/core adds at most 15 KB gzipped to an app's initial bundle, pdfkit, Yoga and
// linebreak never reach an initial chunk, and neither does @ngpdf/core/viewer: the demo loads its
// preview in a deferred chunk, so the viewer in main means @ngpdf/core pulled it in.
//
// 1. Builds dist/core (`npm run build:core`).
// 2. Follows the static imports of dist/core/fesm2022/ngpdf-core.mjs and fails if one of the files
//    it reaches imports pdfkit, Yoga or linebreak, or is the engine chunk. Dynamic import() is not
//    followed: that is how the engine is loaded.
// 3. Builds the demo against dist/core (the `budget` configuration, projects/demo/tsconfig.budget.json),
//    reads the esbuild metafile that `--stats-json` writes, and checks the initial chunks.
//
// esbuild reports bytes per input but not gzip per input, so each chunk's gzip size is shared
// among its inputs in proportion to `bytesInOutput`.
// `--skip-build` reuses dist/core and dist/demo-budget.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 15 * 1024;
const FESM_DIR = 'dist/core/fesm2022';
const CORE_ENTRY = 'ngpdf-core.mjs';
const ENGINE_CHUNK = /^ngpdf-core-engine-[^/]*\.mjs$/;
const ENGINE_PACKAGES = /^(pdfkit|yoga-layout|linebreak)(\/|$)/;
const OUT_DIR = 'dist/demo-budget';
const BROWSER_DIR = join(OUT_DIR, 'browser');
const STATS_FILE = join(OUT_DIR, 'browser-stats.json');
const PACKAGE = /^dist\/core\/fesm2022\//;
const ENGINE_ONLY =
  /(^|\/)node_modules\/(pdfkit|yoga-layout|linebreak)\/|^dist\/core\/fesm2022\/ngpdf-core-engine-/;
const VIEWER = /^dist\/core\/fesm2022\/ngpdf-core-viewer\.mjs$/;
const SOURCES = /^projects\/core\//;

function fail(message) {
  console.error(`bundle-budget: ${message} — FAIL`);
  process.exit(1);
}

if (!process.argv.includes('--skip-build')) {
  execFileSync('npm', ['run', 'build:core'], { stdio: 'inherit' });
}

// Static imports of the package's main entry point.
// FESM files have their imports at the top level, one statement each, and no `;` inside one.
const STATIC_IMPORT =
  /^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm;
if (!existsSync(join(FESM_DIR, CORE_ENTRY))) fail(`no ${join(FESM_DIR, CORE_ENTRY)}`);
const reached = new Set();
const fesmLeaks = [];
const fesmQueue = [CORE_ENTRY];
while (fesmQueue.length > 0) {
  const name = fesmQueue.pop();
  if (reached.has(name)) continue;
  reached.add(name);
  if (ENGINE_CHUNK.test(name)) fesmLeaks.push(`${name} (the engine chunk)`);
  for (const match of readFileSync(join(FESM_DIR, name), 'utf8').matchAll(STATIC_IMPORT)) {
    const specifier = match[1] ?? match[2];
    if (specifier.startsWith('./')) fesmQueue.push(specifier.slice(2));
    else if (ENGINE_PACKAGES.test(specifier)) fesmLeaks.push(`${specifier} (imported by ${name})`);
  }
}
if (fesmLeaks.length > 0) {
  fail(
    `${FESM_DIR}/${CORE_ENTRY} reaches engine code through a static import\n  ${fesmLeaks.join('\n  ')}`,
  );
}

// Without a separate engine chunk, the check above would pass for nothing.
if (!readdirSync(FESM_DIR).some((name) => ENGINE_CHUNK.test(name))) {
  fail(`no engine chunk in ${FESM_DIR}`);
}

if (!process.argv.includes('--skip-build')) {
  execFileSync('npx', ['ng', 'build', 'demo', '-c', 'production,budget', '--stats-json'], {
    stdio: 'inherit',
  });
}

const stats = JSON.parse(readFileSync(STATS_FILE, 'utf8'));
const outputs = stats.outputs;

// The demo must use the package: an input from the sources means a path fell back to them.
const fromSources = Object.values(outputs).flatMap((output) =>
  Object.keys(output.inputs).filter((path) => SOURCES.test(path)),
);
if (fromSources.length > 0) {
  fail(`the demo build reads @ngpdf/core from the sources\n  ${fromSources.join('\n  ')}`);
}

// Initial chunks: the entry point and everything it reaches through static imports.
const entry = Object.keys(outputs).find((name) => outputs[name].entryPoint?.endsWith('/main.ts'));
if (!entry) throw new Error('bundle-budget: no main.ts entry point in the stats file');
const initial = new Set();
const queue = [entry];
while (queue.length > 0) {
  const name = queue.pop();
  if (initial.has(name)) continue;
  initial.add(name);
  for (const edge of outputs[name].imports ?? []) {
    if (edge.kind === 'import-statement' && outputs[edge.path]) queue.push(edge.path);
  }
}

// Without the viewer anywhere in the build, the check below would pass for nothing.
const viewerBuilt = Object.values(outputs).some((output) =>
  Object.keys(output.inputs).some((path) => VIEWER.test(path)),
);
if (!viewerBuilt) fail('the demo does not use @ngpdf/core/viewer');

let eager = 0;
const leaks = [];
const viewerLeaks = [];
for (const name of initial) {
  const output = outputs[name];
  const inputs = Object.entries(output.inputs);
  for (const [path] of inputs) {
    if (ENGINE_ONLY.test(path)) leaks.push(`${path} (in ${name})`);
    if (VIEWER.test(path)) viewerLeaks.push(`${path} (in ${name})`);
  }
  const total = inputs.reduce((sum, [, input]) => sum + input.bytesInOutput, 0);
  if (total === 0) continue;
  const core = inputs
    .filter(([path]) => PACKAGE.test(path) && !VIEWER.test(path))
    .reduce((sum, [, input]) => sum + input.bytesInOutput, 0);
  const gzipped = gzipSync(readFileSync(join(BROWSER_DIR, name))).length;
  eager += (gzipped * core) / total;
}
eager = Math.round(eager);

if (leaks.length > 0) fail(`engine code in an initial chunk\n  ${leaks.join('\n  ')}`);
if (viewerLeaks.length > 0) {
  fail(`@ngpdf/core/viewer in an initial chunk\n  ${viewerLeaks.join('\n  ')}`);
}
if (eager > BUDGET_BYTES) {
  fail(`eager @ngpdf/core is ${eager} B gzipped (budget ${BUDGET_BYTES} B)`);
}
console.log(`eager @ngpdf/core (dist/core): ${eager} B gzipped, engine and viewer lazy — OK`);
