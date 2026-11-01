// Server check: packs the built dist/core, installs the tarball in an empty directory, renders a
// document there with e2e/server/render.mjs under plain `node` (no DOM), and checks the PDF's
// text with pdftotext. This proves the published package renders on the server, not only the
// sources. Run after `npm run build:core`; it needs the npm registry for Angular and the
// package's dependencies, and pdftotext (poppler-utils) on the PATH:
//   NGPDF_APT=poppler-utils ./scripts/dev node scripts/server-check.mjs [--angular <version>]
// `--angular` installs that @angular/core and @angular/compiler instead of the repository's, such
// as 22.0.0, the lowest the peer range allows: renderToBuffer uses a private Angular export.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const EXPECTED = ['Invoice INV-0042', 'Issued by Example Supplies Ltd'];

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const flag = process.argv.indexOf('--angular');
const angular =
  flag >= 0
    ? process.argv[flag + 1]
    : JSON.parse(readFileSync(join(ROOT, 'node_modules/@angular/core/package.json'), 'utf8'))
        .version;
if (!angular) throw new Error('server check: --angular needs a version');
const app = mkdtempSync(join(tmpdir(), 'ngpdf-server-'));
try {
  const [packed] = JSON.parse(
    run('npm', ['pack', join(ROOT, 'dist/core'), '--json', '--pack-destination', app], app),
  );
  writeFileSync(join(app, 'package.json'), '{ "private": true, "type": "module" }\n');
  run(
    'npm',
    [
      'install',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      join(app, packed.filename),
      `@angular/core@${angular}`,
      `@angular/compiler@${angular}`,
    ],
    app,
  );
  copyFileSync(join(ROOT, 'e2e/server/render.mjs'), join(app, 'render.mjs'));
  process.stdout.write(run('node', ['render.mjs', 'out.pdf'], app));

  const text = run('pdftotext', ['-layout', 'out.pdf', '-'], app);
  const lines = text.split('\n').map((line) => line.trim().replace(/\s+/g, ' '));
  const missing = EXPECTED.filter((line) => !lines.includes(line));
  // Thrown, not process.exit(), so the finally below still removes the install.
  if (missing.length > 0) {
    throw new Error(`server check: missing from the PDF text: ${missing.join(', ')}\n${text}`);
  }
  console.log(
    `server check: ${packed.filename} with @angular/core ${angular} on Node ${process.version} — OK`,
  );
} finally {
  rmSync(app, { recursive: true, force: true });
}
