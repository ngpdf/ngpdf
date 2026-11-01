import { propsOf, type PdfNode } from '../tree/node';
import { show } from './style';

const SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * The URL a pdf-link points to, parsed and normalized, or undefined when its `href` is not an
 * absolute http, https or mailto URL. No other scheme is ever written to the PDF. A refused URL
 * leaves the content drawn as plain content and goes to `warn`, since links often come from data.
 */
export function linkUrl(node: PdfNode, warn?: (message: string) => void): string | undefined {
  const href = propsOf(node)['href'];
  if (typeof href === 'string') {
    try {
      const url = new URL(href);
      if (SCHEMES.has(url.protocol)) return url.href;
    } catch {
      // Relative or malformed: warned below.
    }
  }
  warn?.(
    `ngpdf: pdf-link href "${show(String(href))}" is not an absolute http, https or mailto URL; no link written`,
  );
  return undefined;
}
