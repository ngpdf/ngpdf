import { PLATFORM_ID, type Injector } from '@angular/core';

/**
 * Throws on the server, where there is no page to save a file from or show a PDF in. Checked
 * first, so the error names the API instead of some DOM call deep inside it. No global `document`
 * covers a plain Node script and Angular SSR, which keeps its DOM off the globals; the platform
 * covers a server that put one there.
 */
export function assertBrowser(api: string, injector: Injector): void {
  if (typeof document === 'undefined' || injector.get(PLATFORM_ID, null) === 'server') {
    throw new Error(
      `ngpdf: ${api} needs a browser; on the server, use renderToBuffer from @ngpdf/core/server`,
    );
  }
}
