// The facts every page builds its links and SEO tags from.
import { SITE_DATA } from '../generated/site-data';

export const SITE_URL = 'https://ngpdf.dev';
export const SITE_NAME = 'ngpdf';
export const TAGLINE = 'PDFs as Angular components';
export const DEFAULT_DESCRIPTION =
  'ngpdf renders Angular components to PDF in the browser: real text, tables with repeating headers, page breaks and page numbers, with a 2 KB eager bundle.';

export const GITHUB_URL = 'https://github.com/ngpdf/ngpdf';
export const NPM_URL = 'https://www.npmjs.com/package/@ngpdf/core';
export const PACKAGE_NAME = '@ngpdf/core';
export const VERSION = SITE_DATA.version;
export const OG_IMAGE = '/og.png';

/** `/docs/tables` becomes `https://ngpdf.dev/docs/tables`; `/` keeps its one slash. */
export function urlFor(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

export function editUrlFor(slug: string): string {
  return `${GITHUB_URL}/edit/main/projects/site/src/content/docs/${slug}.md`;
}
