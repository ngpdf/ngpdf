import { RenderMode, type ServerRoute } from '@angular/ssr';
import { DOC_PAGES } from './docs/docs-index';

// Every page is prerendered to static HTML, which is all the FTP host serves.
export const serverRoutes: ServerRoute[] = [
  {
    path: 'docs/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: () => Promise.resolve(DOC_PAGES.map((page) => ({ slug: page.slug }))),
  },
  // Unknown paths are answered by the host's 404 page (.htaccess), not prerendered one by one.
  { path: '**', renderMode: RenderMode.Prerender },
];
