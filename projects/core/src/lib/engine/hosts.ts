import type { PdfNode } from '../tree/node';
import { MAX_NESTING } from './style';

const PDF_ELEMENTS = new Set([
  'pdf-document',
  'pdf-page',
  'pdf-view',
  'pdf-text',
  'pdf-span',
  'pdf-link',
  'pdf-image',
  'pdf-table',
  'pdf-row',
  'pdf-cell',
  'pdf-page-number',
]);

/** A user component's host (or any element that is not one of the pdf-* elements). */
function isHost(node: PdfNode): boolean {
  return node.kind === 'element' && !PDF_ELEMENTS.has(node.tag);
}

/**
 * A copy of the document's tree in which every component host is replaced by its children, like
 * CSS `display: contents`. Every later stage then sees pages under the document, rows under a
 * table and cells under a row however the template splits them into components. A host's own
 * style is dropped, with a warning. The input tree is left unchanged.
 */
export function dissolveHosts(document: PdfNode, warn: (message: string) => void): PdfNode {
  const ignoreStyle = (host: PdfNode): void => {
    if (Object.keys(host.rawStyle).length > 0) {
      warn(`ngpdf: styles on <${host.tag}> are ignored; style a pdf-* element inside it`);
    }
  };
  for (let above = document.parent; above; above = above.parent) {
    if (isHost(above)) ignoreStyle(above);
  }

  const copy = (node: PdfNode, parent: PdfNode | null, depth: number): PdfNode => {
    // The limit counts elements: a text node or an @if/@for anchor is not one more level.
    if (node.kind === 'element' && depth > MAX_NESTING) {
      throw new Error(`ngpdf: nesting deeper than ${String(MAX_NESTING)}`);
    }
    const out: PdfNode = { ...node, parent, children: [] };
    // A loop, not recursion: hosts do not count towards the nesting limit, so a chain of them
    // can be as long as the template makes it.
    const pending = [...node.children].reverse();
    for (let child = pending.pop(); child; child = pending.pop()) {
      if (isHost(child)) {
        ignoreStyle(child);
        // Not push(...children): spreading a host with a huge number of rows overflows too.
        for (const grandchild of [...child.children].reverse()) pending.push(grandchild);
      } else {
        out.children.push(copy(child, out, depth + 1));
      }
    }
    return out;
  };

  const root = copy(document, null, 1);
  if (!root.children.some((child) => child.kind === 'element' && child.tag === 'pdf-page')) {
    throw new Error('ngpdf: pdf-document has no pdf-page');
  }
  return root;
}
