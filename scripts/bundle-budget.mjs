// Bundle budget: importing @ngpdf/core adds at most 15 KB gzipped to an app's initial bundle,
// pdfkit and Yoga never reach an initial chunk, and neither does @ngpdf/core/viewer: the demo
// loads its preview in a deferred chunk, so the viewer in main means @ngpdf/core pulled it in.
// Builds the demo, reads the esbuild metafile
// that `--stats-json` writes, and checks the initial chunks.
//
// esbuild reports bytes per input but not gzip per input, so each chunk's gzip size is shared
// among its inputs in proportion to `bytesInOutput`.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 15 * 1024;
const OUT_DIR = 'dist/demo';
const BROWSER_DIR = join(OUT_DIR, 'browser');
const STATS_FILE = join(OUT_DIR, 'browser-stats.json');
const EAGER_CORE = /^projects\/core\/src\/lib\/(tree|elements|render)\//;
const ENGINE_ONLY = /(^|\/)(pdfkit|yoga-layout)(\/|$)|^projects\/core\/src\/lib\/engine\//;
const VIEWER = /^projects\/core\/viewer\//;

if (!process.argv.includes('--skip-build')) {
  execFileSync('npx', ['ng', 'build', 'demo', '--stats-json'], { stdio: 'inherit' });
}

const stats = JSON.parse(readFileSync(STATS_FILE, 'utf8'));
const outputs = stats.outputs;

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
if (!viewerBuilt) {
  console.error('bundle-budget: the demo does not use @ngpdf/core/viewer — FAIL');
  process.exit(1);
}

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
    .filter(([path]) => EAGER_CORE.test(path))
    .reduce((sum, [, input]) => sum + input.bytesInOutput, 0);
  const gzipped = gzipSync(readFileSync(join(BROWSER_DIR, name))).length;
  eager += (gzipped * core) / total;
}
eager = Math.round(eager);

if (leaks.length > 0) {
  console.error(
    `eager @ngpdf/core: engine code in an initial chunk — FAIL\n  ${leaks.join('\n  ')}`,
  );
  process.exit(1);
}
if (viewerLeaks.length > 0) {
  console.error(
    `eager @ngpdf/core: @ngpdf/core/viewer in an initial chunk — FAIL\n  ${viewerLeaks.join('\n  ')}`,
  );
  process.exit(1);
}
if (eager > BUDGET_BYTES) {
  console.error(`eager @ngpdf/core: ${eager} B gzipped — FAIL (budget ${BUDGET_BYTES} B)`);
  process.exit(1);
}
console.log(`eager @ngpdf/core: ${eager} B gzipped, viewer lazy — OK`);
