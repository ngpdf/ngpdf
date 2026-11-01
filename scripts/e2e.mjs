// End-to-end check: builds the demo in development mode (it exposes window.ngpdfDemo there),
// renders the demo documents in headless Chrome, extracts their text with pdftotext and compares
// it with e2e/expected/<name>.txt. It also checks that the demo's pdf-viewer shows a PDF in its
// iframe, and shows the new one after an edit. `--update` rewrites the expected files;
// `--skip-build` reuses dist/demo.
//
// Runs on the host: needs node, /usr/bin/google-chrome and pdftotext/pdfimages (poppler-utils).
// The expected files assume poppler 24 (Ubuntu 24.04, which CI uses). Without pdftotext on the
// host, or with NGPDF_E2E_DOCKER=1, one Ubuntu 24.04 container extracts the text of all PDFs. Any
// other poppler major version fails the run, since its text layout may differ.
/* global window, document */
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
  { name: 'span-sample', pages: 1, contains: ['#1024', '12 days overdue', 'Łódź', 'after 2 pm,…'] },
  { name: 'article-sample', pages: 3, contains: ['Field notes', 'Page 3 of 3'] },
  {
    name: 'fixed-sample',
    pages: 3,
    contains: ['Stock count', 'Sheet 1 of 3', 'Sheet 3 of 3', '3/3', 'SKU-1069'],
  },
  // The same document with debug outlines: the same pages, plus a label on each box.
  {
    name: 'fixed-debug',
    pages: 3,
    contains: ['Stock count', 'Sheet 3 of 3', 'SKU-1069', 'row 347.5×18', 'page-number 76.2×12'],
  },
  {
    name: 'contents-sample',
    pages: 3,
    contains: ['Contents', '1. The route', '3. Next season', 'Back to the contents', 'Page 3 of 3'],
    // Named destination -> 1-based page, the targets of the GoTo links, and the outline tree.
    navigation: {
      destinations: { contents: 1, markers: 2, next: 3, route: 1 },
      links: ['contents', 'contents', 'contents', 'markers', 'next', 'route'],
      outline: [
        '1. The route',
        '  Northern ridge',
        '  Valley floor',
        '2. Markers found',
        '  Standing stones',
        '  Sunken stones',
        '3. Next season',
        '  Equipment',
      ],
    },
  },
  // Encrypted: extracted with this user password, and it must not open without it.
  { name: 'secure-sample', pages: 1, password: 'demo-1234', contains: ['Net pay: € 2,480.75'] },
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

/**
 * Text of every PDF (layout mode), its embedded image count and, for an encrypted one, whether
 * pdftotext refused it without the password, keyed by document name.
 */
function extractAll(documents) {
  const names = documents.map((document) => document.name);
  const passwords = Object.fromEntries(documents.map((d) => [d.name, d.password]));
  if (!useDocker) {
    // pdftotext prints its version on stderr.
    const result = spawnSync(PDFTOTEXT, ['-v'], { encoding: 'utf8' });
    checkPoppler(`${result.stdout}${result.stderr}`);
    return Object.fromEntries(
      names.map((name) => {
        const pdf = join(OUT, `${name}.pdf`);
        const password = passwords[name] === undefined ? [] : ['-upw', passwords[name]];
        return [
          name,
          {
            raw: execFileSync(PDFTOTEXT, [...password, '-layout', pdf, '-'], { encoding: 'utf8' }),
            images: countImages(
              execFileSync('pdfimages', [...password, '-list', pdf], { encoding: 'utf8' }),
            ),
            locked: spawnSync(PDFTOTEXT, [pdf, '-'], { stdio: 'ignore' }).status !== 0,
          },
        ];
      }),
    );
  }
  // One container for all PDFs; the text and image listing are separated by markers.
  const script = [
    'export DEBIAN_FRONTEND=noninteractive',
    // stdout is the text of the PDFs, so apt-get prints only its errors, on stderr.
    'apt-get -qq update >/dev/null && apt-get -qq install -y --no-install-recommends poppler-utils >/dev/null' +
      ' || { echo "e2e: apt-get could not install poppler-utils in Docker" >&2; exit 1; }',
    'echo "@@@VERSION $(pdftotext -v 2>&1 | head -n 1)"',
    // The passwords are made-up demo values, safe to put on a command line.
    ...documents.map(({ name, password }) => {
      const pdf = `/w/e2e/out/${name}.pdf`;
      const upw = password === undefined ? '' : `-upw '${password}' `;
      return [
        `echo "@@@TEXT ${name}"; pdftotext ${upw}-layout ${pdf} -`,
        `echo "@@@IMAGES ${name}"; pdfimages ${upw}-list ${pdf}`,
        `pdftotext ${pdf} - >/dev/null 2>&1; echo "@@@LOCKED ${name} $?"`,
      ].join('\n');
    }),
  ].join('\n');
  const output = runDocker([
    'run',
    '--rm',
    '--name',
    `ngpdf-e2e-${String(process.pid)}`,
    '-v',
    `${ROOT}:/w:ro`,
    'ubuntu:24.04',
    'sh',
    '-c',
    script,
  ]);
  checkPoppler(output.split('@@@VERSION ')[1]?.split('\n')[0] ?? '');
  const result = {};
  for (const name of names) {
    const text = output.split(`@@@TEXT ${name}\n`)[1]?.split('@@@IMAGES')[0] ?? '';
    const images = output.split(`@@@IMAGES ${name}\n`)[1]?.split('@@@LOCKED')[0] ?? '';
    const locked = output.split(`@@@LOCKED ${name} `)[1]?.split('\n')[0] !== '0';
    result[name] = { raw: text, images: countImages(images), locked };
  }
  return result;
}

/** Runs `docker` with these arguments and returns its stdout; its stderr goes to the terminal. */
function runDocker(args) {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      timeout: 5 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // The default message repeats the whole shell script; the reason is already on stderr.
    throw new Error(
      `e2e: the Docker step failed (${error.status ?? error.code}); see its output above`,
      { cause: error },
    );
  }
}

/** Images in a `pdfimages -list` listing; soft masks (a PNG's alpha) are not counted. */
function countImages(listing) {
  return listing
    .split('\n')
    .slice(2)
    .filter((line) => line.trim().split(/\s+/)[2] === 'image').length;
}

/** Throws unless `pdftotext -v` reports the poppler major version the expected files were made with. */
function checkPoppler(versionOutput) {
  const major = Number(/version (\d+)/.exec(versionOutput)?.[1]);
  if (major === GOLDEN_POPPLER_MAJOR) return;
  const found = Number.isNaN(major) ? 'an unknown version' : `${major}.x`;
  const fix = useDocker
    ? ''
    : `; install poppler ${GOLDEN_POPPLER_MAJOR} or run with NGPDF_E2E_DOCKER=1`;
  throw new Error(
    `e2e: pdftotext is ${found}, but the expected files need poppler ${GOLDEN_POPPLER_MAJOR}.x${fix}`,
  );
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
/**
 * The named destinations (name -> 1-based page), the targets of the GoTo links (sorted) and the
 * outline (titles indented two spaces per level) of a pdfkit file. pdfkit writes these
 * dictionaries uncompressed, one object each, so plain matching is enough; names and titles in
 * the demo are ASCII and need no unescaping.
 */
function navigationOf(pdf) {
  const text = pdf.toString('latin1');
  const objects = new Map();
  for (const match of text.matchAll(/(\d+) 0 obj\s*(<<[\s\S]*?>>)\s*(?:stream|endobj)/g)) {
    objects.set(match[1], match[2]);
  }
  const ref = (body, key) => body.match(new RegExp(`/${key} (\\d+) 0 R`))?.[1];
  const catalog = [...objects.values()].find((body) => body.includes('/Type /Catalog'));
  const kids = [...objects.values()].find((body) => /\/Type \/Pages\b/.test(body));
  const pages = [...(kids?.match(/\/Kids \[([^\]]*)\]/)?.[1] ?? '').matchAll(/(\d+) 0 R/g)].map(
    (match) => match[1],
  );

  // Only the destinations a viewer can reach: the /Dests tree under the catalog's /Names.
  const names = catalog && ref(catalog, 'Names');
  const tree = (names && objects.get(names)?.match(/\/Dests\s*<<([\s\S]*)>>/)?.[1]) ?? '';
  const destinations = {};
  for (const match of tree.matchAll(/\(([^()]*)\) \[(\d+) 0 R \/XYZ/g)) {
    destinations[match[1]] = pages.indexOf(match[2]) + 1;
  }
  const links = [...text.matchAll(/\/S \/GoTo\s*\/D \(([^()]*)\)/g)]
    .map((match) => match[1])
    .sort();

  const outline = [];
  const walk = (id, depth) => {
    for (let item = id; item !== undefined; item = ref(objects.get(item) ?? '', 'Next')) {
      const body = objects.get(item) ?? '';
      outline.push(`${'  '.repeat(depth)}${body.match(/\/Title \(([^()]*)\)/)?.[1] ?? '?'}`);
      walk(ref(body, 'First'), depth + 1);
    }
  };
  const root = catalog && ref(catalog, 'Outlines');
  if (root) walk(ref(objects.get(root) ?? '', 'First'), 0);
  const sorted = Object.fromEntries(
    Object.entries(destinations).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return { destinations: sorted, links, outline };
}

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

/** The blob: URL in the preview's iframe once Chrome has opened it as a PDF, other than `previous`. */
async function viewerPdf(page, previous) {
  const handle = await within(
    page.waitForFunction(
      (previousUrl) => {
        const iframe = document.querySelector('app-preview pdf-viewer iframe');
        if (!iframe?.src.startsWith('blob:') || iframe.src === previousUrl) return false;
        return iframe.contentDocument?.contentType === 'application/pdf' && iframe.src;
      },
      { timeout: TIMEOUT_MS },
      previous,
    ),
    'waiting for the preview iframe',
  );
  const url = await handle.jsonValue();
  // Chrome shows a PDF through its viewer extension, in a frame inside the iframe. A blocked
  // frame (a sandboxed one, for one) gets an error page and no such frame.
  await within(
    (async () => {
      for (;;) {
        const frame = page.frames().find((candidate) => candidate.url() === url);
        if (frame?.childFrames().some((child) => child.url().startsWith('chrome-extension://')))
          return;
        await new Promise((done) => setTimeout(done, 100));
      }
    })(),
    `Chrome's PDF viewer opening ${url}`,
  );
  return url;
}

async function checkViewer(page) {
  const first = await viewerPdf(page);
  await page.type('app-preview input', ' 2');
  await viewerPdf(page, first);
  const revoked = await page.evaluate(
    (url) =>
      fetch(url).then(
        () => false,
        () => true,
      ),
    first,
  );
  if (!revoked) throw new Error(`${first} was not revoked after the new PDF replaced it`);
}

if (!process.argv.includes('--skip-build')) {
  const build = ['ng', 'build', 'demo', '--configuration', 'development'];
  // Locally the toolchain is in Docker; in CI Node is already on the runner.
  if (process.env.CI) execFileSync('npx', build, { cwd: ROOT, stdio: 'inherit' });
  else execFileSync(join(ROOT, 'scripts/dev'), ['npx', ...build], { cwd: ROOT, stdio: 'inherit' });
}
mkdirSync(OUT, { recursive: true });
mkdirSync(EXPECTED, { recursive: true });

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

  try {
    await checkViewer(page);
    console.log('OK pdf-viewer (the iframe shows the PDF, and the new one after an edit)');
  } catch (error) {
    failed = true;
    console.error(`FAIL pdf-viewer\n  ${error instanceof Error ? error.message : error}`);
  }

  const extracted = extractAll(DOCUMENTS);
  for (const document of DOCUMENTS) {
    const { raw, images, locked } = extracted[document.name];
    const text = normalizeText(raw);
    const expectedPath = join(EXPECTED, `${document.name}.txt`);

    const problems = [];
    // pdftotext ends each page with a form feed.
    const pageCount = (raw.match(/\f/g) ?? []).length;
    if (pageCount !== document.pages)
      problems.push(`expected ${document.pages} pages, got ${pageCount}`);
    if (images !== (document.images ?? 0))
      problems.push(`expected ${document.images ?? 0} embedded images, got ${images}`);
    if (locked !== (document.password !== undefined))
      problems.push(
        locked ? 'pdftotext could not open it without a password' : 'it opens without a password',
      );
    for (const needle of document.contains) {
      if (!text.includes(needle)) problems.push(`text does not contain "${needle}"`);
    }
    if (document.navigation) {
      const pdf = readFileSync(join(OUT, `${document.name}.pdf`));
      const found = navigationOf(pdf);
      for (const key of ['destinations', 'links', 'outline']) {
        const want = JSON.stringify(document.navigation[key]);
        const got = JSON.stringify(found[key]);
        if (want !== got) problems.push(`${key}: expected ${want}, got ${got}`);
      }
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
