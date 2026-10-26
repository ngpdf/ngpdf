// End-to-end check: builds the demo in development mode (it exposes window.ngpdfDemo there),
// renders the demo documents in headless Chrome, extracts their text with pdftotext and compares
// it with e2e/expected/<name>.txt. `--update` rewrites the expected files; `--skip-build` reuses
// dist/demo.
//
// Runs on the host: needs node, /usr/bin/google-chrome and pdftotext/pdfimages (poppler-utils).
// The expected files assume poppler 24 (Ubuntu 24.04, which CI uses). Without it on the host, or
// with NGPDF_E2E_DOCKER=1, one Docker container (Debian bookworm, poppler 22) extracts the text of
// all PDFs, and the script warns that the versions differ.
/* global window */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = join(ROOT, 'dist/demo/browser');
const OUT = join(ROOT, 'e2e/out');
const EXPECTED = join(ROOT, 'e2e/expected');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const PDFTOTEXT = '/usr/bin/pdftotext';

// Page counts follow from the row geometry: see the report of task 12.
const DOCUMENTS = [
  { name: 'capture-report', pages: 1, images: 1, contains: ['Gerado em 22/10/2026 14:30'] },
  {
    name: 'communicators-list',
    pages: 5,
    contains: ['Página 5 de 5', 'pessoa140@example.com', 'Página 1 de 5'],
  },
  { name: 'licences-list', pages: 3, contains: ['Página 3 de 3', 'R$'] },
  {
    name: 'fonts-sample',
    pages: 1,
    contains: ['Łódź', 'καλημέρα', 'доброе утро', '日本語の文字テスト', 'Страница 1 / 1'],
  },
];

const update = process.argv.includes('--update');
const TIMEOUT_MS = 60_000;
const GOLDEN_POPPLER_MAJOR = 24;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
};

function serve() {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
    const file = resolve(SITE, `.${path === sep || path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(SITE + sep) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

const useDocker = process.env.NGPDF_E2E_DOCKER === '1' || !existsSync(PDFTOTEXT);

/** Text of every PDF (layout mode) and its embedded image count, keyed by document name. */
function extractAll(names) {
  if (!useDocker) {
    return Object.fromEntries(
      names.map((name) => {
        const pdf = join(OUT, `${name}.pdf`);
        return [
          name,
          {
            raw: execFileSync(PDFTOTEXT, ['-layout', pdf, '-'], { encoding: 'utf8' }),
            images: countImages(execFileSync('pdfimages', ['-list', pdf], { encoding: 'utf8' })),
          },
        ];
      }),
    );
  }
  // One container for all PDFs; the text and image listing are separated by markers.
  const script = [
    'export DEBIAN_FRONTEND=noninteractive',
    'apt-get -qq update >/dev/null && apt-get -qq install -y poppler-utils >/dev/null 2>&1',
    'pdftotext -v >&2',
    `for n in ${names.join(' ')}; do`,
    '  echo "@@@TEXT $n"; pdftotext -layout /w/e2e/out/$n.pdf -',
    '  echo "@@@IMAGES $n"; pdfimages -list /w/e2e/out/$n.pdf',
    'done',
  ].join('\n');
  const output = execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--name',
      `ngpdf-e2e-${String(process.pid)}`,
      '-v',
      `${ROOT}:/w:ro`,
      'node:24-bookworm-slim',
      'sh',
      '-c',
      script,
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      timeout: 5 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const result = {};
  for (const name of names) {
    const text = output.split(`@@@TEXT ${name}\n`)[1]?.split('@@@IMAGES')[0] ?? '';
    const images = output.split(`@@@IMAGES ${name}\n`)[1]?.split('@@@TEXT')[0] ?? '';
    result[name] = { raw: text, images: countImages(images) };
  }
  return result;
}

/** Images in a `pdfimages -list` listing; soft masks (a PNG's alpha) are not counted. */
function countImages(listing) {
  return listing
    .split('\n')
    .slice(2)
    .filter((line) => line.trim().split(/\s+/)[2] === 'image').length;
}

function pdftotextMajor() {
  if (useDocker) return 22; // Debian bookworm
  // pdftotext prints its version on stderr.
  const result = spawnSync(PDFTOTEXT, ['-v'], { encoding: 'utf8' });
  return Number(/version (\d+)/.exec(`${result.stdout}${result.stderr}`)?.[1]);
}

/** Fails with a clear message when a browser step takes longer than TIMEOUT_MS. */
function within(promise, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`e2e: timed out after ${TIMEOUT_MS / 1000} s: ${what}`)),
      TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const normalizeText = (text) =>
  text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trimEnd() + '\n';

/** A short line diff for the failure message. */
function diff(expected, actual) {
  const a = expected.split('\n');
  const b = actual.split('\n');
  const lines = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i])
      lines.push(`  line ${i + 1}\n    - ${a[i] ?? '(missing)'}\n    + ${b[i] ?? '(missing)'}`);
    if (lines.length >= 5) break;
  }
  return lines.join('\n');
}

if (!process.argv.includes('--skip-build')) {
  const build = ['ng', 'build', 'demo', '--configuration', 'development'];
  // Locally the toolchain is in Docker; in CI Node is already on the runner.
  if (process.env.CI) execFileSync('npx', build, { cwd: ROOT, stdio: 'inherit' });
  else execFileSync(join(ROOT, 'scripts/dev'), ['npx', ...build], { cwd: ROOT, stdio: 'inherit' });
}
mkdirSync(OUT, { recursive: true });
mkdirSync(EXPECTED, { recursive: true });

const major = pdftotextMajor();
if (major !== GOLDEN_POPPLER_MAJOR) {
  console.warn(
    `warning: pdftotext ${major}.x, the expected files were made with ${GOLDEN_POPPLER_MAJOR}.x; text layout may differ`,
  );
}

const server = await serve();
let browser;
let failed = false;
try {
  browser = await within(
    puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox'],
      timeout: TIMEOUT_MS,
    }),
    `launching ${CHROME}`,
  );
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  page.on('pageerror', (error) => console.error('page error:', error.message));
  await within(page.goto(`http://127.0.0.1:${server.address().port}/`), 'opening the demo');
  await page.waitForFunction(() => window.ngpdfDemo !== undefined, { timeout: TIMEOUT_MS });

  for (const { name } of DOCUMENTS) {
    const base64 = await within(
      page.evaluate((documentName) => window.ngpdfDemo.render(documentName), name),
      `rendering ${name}`,
    );
    writeFileSync(join(OUT, `${name}.pdf`), Buffer.from(base64, 'base64'));
  }

  const extracted = extractAll(DOCUMENTS.map((document) => document.name));
  for (const document of DOCUMENTS) {
    const { raw, images } = extracted[document.name];
    const text = normalizeText(raw);
    const expectedPath = join(EXPECTED, `${document.name}.txt`);

    const problems = [];
    // pdftotext ends each page with a form feed.
    const pageCount = (raw.match(/\f/g) ?? []).length;
    if (pageCount !== document.pages)
      problems.push(`expected ${document.pages} pages, got ${pageCount}`);
    if (images !== (document.images ?? 0))
      problems.push(`expected ${document.images ?? 0} embedded images, got ${images}`);
    for (const needle of document.contains) {
      if (!text.includes(needle)) problems.push(`text does not contain "${needle}"`);
    }
    if (update) {
      writeFileSync(expectedPath, text);
    } else if (!existsSync(expectedPath)) {
      problems.push(`${expectedPath} is missing; run with --update`);
    } else {
      const expected = readFileSync(expectedPath, 'utf8');
      if (expected !== text)
        problems.push(`text differs from ${expectedPath}\n${diff(expected, text)}`);
    }

    if (problems.length > 0) {
      failed = true;
      console.error(`FAIL ${document.name}\n  ${problems.join('\n  ')}`);
    } else {
      console.log(
        `OK ${document.name} (${pageCount} page${pageCount === 1 ? '' : 's'})${update ? ' [updated]' : ''}`,
      );
    }
  }
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  await browser?.close();
  server.close();
}
if (failed) process.exit(1);
