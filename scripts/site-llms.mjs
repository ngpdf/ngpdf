// Writes llms.txt and llms-full.txt into the built site (https://llmstxt.org): an index of the
// documentation for language models and AI assistants, and the whole documentation as one
// Markdown file. Both come from the same Markdown the site renders, so they never drift.
// Usage: node scripts/site-llms.mjs [dist/site/browser] [https://ngpdf.dev]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = 'projects/site/src/content/docs';
const SECTIONS = ['Guide', 'Reference', 'Project'];

/** Front matter `key: value` lines and the body of one docs page. */
export function readPage(source, slug) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) throw new Error(`${slug}.md has no front matter`);
  const fields = Object.fromEntries(
    match[1].split(/\r?\n/).map((line) => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
    }),
  );
  return {
    slug,
    title: fields.title,
    description: fields.description,
    section: fields.section,
    order: Number(fields.order),
    body: source.slice(match[0].length).trim(),
  };
}

export function sortPages(pages) {
  return [...pages].sort(
    (a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.order - b.order,
  );
}

export function llmsIndex(pages, origin, version) {
  const lines = [
    '# ngpdf',
    '',
    `> ngpdf (\`@ngpdf/core\`, v${version}, MIT) renders Angular components to PDF in the browser. A document is a normal Angular component whose template uses the pdf-* elements (pdf-document, pdf-page, pdf-view, pdf-text, pdf-image, pdf-canvas, pdf-table, pdf-row, pdf-cell, pdf-page-number). ngpdf lays it out with flexbox (Yoga), breaks it into pages with repeating table headers and page numbers, and writes real, selectable text with pdfkit. It adds about 2 KB gzipped to the initial bundle; the engine loads on the first render. For Angular 22+, zoneless or zone.js.`,
    '',
    'Install with `npm install @ngpdf/core`. Render with `inject(PdfRenderer).download(MyDocument, { inputs, fileName })` or `.toBlob(...)`.',
    '',
  ];
  for (const section of SECTIONS) {
    lines.push(`## ${section}`, '');
    for (const page of pages.filter((p) => p.section === section)) {
      lines.push(`- [${page.title}](${origin}/docs/${page.slug}): ${page.description}`);
    }
    lines.push('');
  }
  lines.push(
    '## Optional',
    '',
    `- [Full documentation as one file](${origin}/llms-full.txt): every page above, in Markdown.`,
    `- [Examples](${origin}/examples): complete documents rendered in the browser.`,
    `- [Source on GitHub](https://github.com/ngpdf/ngpdf)`,
    `- [Package on npm](https://www.npmjs.com/package/@ngpdf/core)`,
    '',
  );
  return lines.join('\n');
}

export function llmsFull(pages, origin, version) {
  const parts = [`# ngpdf documentation (v${version})`, '', `Source: ${origin}/docs`, ''];
  for (const page of pages) {
    parts.push(`# ${page.title}`, '', `URL: ${origin}/docs/${page.slug}`, '', page.body, '');
  }
  return parts.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? 'dist/site/browser';
  const origin = process.argv[3] ?? 'https://ngpdf.dev';
  const version = JSON.parse(readFileSync('projects/core/package.json', 'utf8')).version;
  const pages = sortPages(
    readdirSync(DOCS)
      .filter((name) => name.endsWith('.md'))
      .map((name) => readPage(readFileSync(join(DOCS, name), 'utf8'), name.slice(0, -3))),
  );
  writeFileSync(join(root, 'llms.txt'), llmsIndex(pages, origin, version));
  writeFileSync(join(root, 'llms-full.txt'), llmsFull(pages, origin, version));
  console.log(`llms.txt: ${String(pages.length)} pages`);
}
