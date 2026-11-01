import { propsOf, type PdfNode } from '../tree/node';
import { show } from './style';

const SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * Where a pdf-link points: its URL, parsed and normalized, or `#name` for the anchor `name`. It is
 * undefined when `href` is neither an absolute http, https or mailto URL nor `#` and a name in
 * `anchors`. No other scheme is ever written to the PDF. A refused href leaves the content drawn
 * as plain content and goes to `warn`, since links often come from data.
 */
export function linkUrl(
  node: PdfNode,
  warn?: (message: string) => void,
  anchors?: ReadonlySet<string>,
): string | undefined {
  const href = propsOf(node)['href'];
  if (typeof href === 'string' && href.trim().startsWith('#')) {
    // An absolute URL never starts with "#", so the two kinds cannot be confused downstream.
    const name = href.trim().slice(1).trim();
    if (anchors?.has(name)) return `#${name}`;
    warn?.(`ngpdf: pdf-link href "${show(href)}" names no anchor; no link written`);
    return undefined;
  }
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
