// Finishes the built site in dist/site/browser after `ng build site`:
// - sitemap.xml, from the pages the prerender produced (the 404 page left out);
// - the CSP in .htaccess, with the SHA-256 of every inline script Angular wrote (the hydration
//   event contract), so script-src needs no 'unsafe-inline';
// - removes index.csr.html, a client-only shell a static host never serves.
// Usage: node scripts/site-postbuild.mjs [dist/site/browser] [https://ngpdf.dev]
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function pagePaths(root) {
  const paths = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === 'index.html') {
        const path = relative(root, dir).split(sep).join('/');
        if (path !== '404') paths.push(path === '' ? '/' : `/${path}`);
      }
    }
  };
  walk(root);
  return paths.sort();
}

export function sitemap(origin, paths, lastmod) {
  const urls = paths.map((path) => {
    const loc = path === '/' ? `${origin}/` : `${origin}${path}`;
    const priority = path === '/' ? '1.0' : path.startsWith('/docs') ? '0.8' : '0.6';
    return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority></url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** The CSP source of each executable inline script: no src, and a JavaScript type or none. */
export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script[^>]*>/gi)) {
    const attributes = match[1] ?? '';
    if (/\ssrc=/i.test(attributes)) continue;
    const type = /\stype="([^"]*)"/i.exec(attributes)?.[1]?.toLowerCase();
    if (type && type !== 'text/javascript' && type !== 'module') continue;
    const digest = createHash('sha256')
      .update(match[2] ?? '')
      .digest('base64');
    hashes.add(`'sha256-${digest}'`);
  }
  return hashes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? 'dist/site/browser';
  const origin = process.argv[3] ?? 'https://ngpdf.dev';
  const paths = pagePaths(root);
  writeFileSync(
    join(root, 'sitemap.xml'),
    sitemap(origin, paths, new Date().toISOString().slice(0, 10)),
  );

  const hashes = new Set();
  for (const path of [...paths, '/404']) {
    const file = join(root, path === '/' ? '' : path.slice(1), 'index.html');
    for (const hash of inlineScriptHashes(readFileSync(file, 'utf8'))) hashes.add(hash);
  }
  const htaccess = join(root, '.htaccess');
  const config = readFileSync(htaccess, 'utf8');
  // The placeholder also appears in a comment; only the one in the header value is filled.
  const placeholder = "script-src 'self' SCRIPT_HASHES";
  if (!config.includes(placeholder)) throw new Error(`.htaccess has no "${placeholder}" to fill`);
  writeFileSync(
    htaccess,
    config.replace(placeholder, `script-src 'self' ${[...hashes].sort().join(' ')}`),
  );

  rmSync(join(root, 'index.csr.html'), { force: true });
  console.log(
    `site: ${String(paths.length)} pages in sitemap.xml, ${String(hashes.size)} script hashes in the CSP`,
  );
}
