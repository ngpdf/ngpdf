import { PLATFORM_ID, type Injector } from '@angular/core';

/**
 * False on the server, where there is no page to save a file from or show a PDF in. No global
 * `document` covers a plain Node script and Angular SSR, which keeps its DOM off the globals; the
 * platform covers a server that put one there.
 */
export function isBrowser(injector: Injector): boolean {
  return typeof document !== 'undefined' && injector.get(PLATFORM_ID, null) !== 'server';
}

/** Throws on the server, before any work, so the error names the API instead of a DOM call. */
export function assertBrowser(api: string, injector: Injector): void {
  if (!isBrowser(injector)) {
    throw new Error(
      `ngpdf: ${api} needs a browser; on the server, use renderToBuffer from @ngpdf/core/server`,
    );
  }
}
