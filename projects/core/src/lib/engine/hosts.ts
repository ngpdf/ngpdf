import type { PdfNode } from '../tree/node';
import { oneOf } from './keyword';
import { MAX_NESTING } from './limits';

const PDF_ELEMENTS = new Set([
  'pdf-document',
  'pdf-page',
  'pdf-view',
  'pdf-text',
  'pdf-span',
  'pdf-link',
  'pdf-note',
  'pdf-image',
  'pdf-table',
  'pdf-row',
  'pdf-cell',
  'pdf-page-number',
  'pdf-canvas',
  'pdf-svg',
]);

/**
 * Whether an element is hidden: `display` is `flex` (the default) or `none`, and any other value
 * throws. Read here, before styles resolve, so no later stage sees a hidden element. Not
 * inherited, as in CSS; a hidden element takes its children with it.
 */
function isHidden(node: PdfNode): boolean {
  const value = node.rawStyle['display'];
  if (value === undefined) return false;
  return oneOf(value, ['flex', 'none'], 'display', node.tag) === 'none';
}

/** A user component's host (or any element that is not one of the pdf-* elements). */
function isHost(node: PdfNode): boolean {
  return node.kind === 'element' && !PDF_ELEMENTS.has(node.tag);
}

const ignoreStyle = (host: PdfNode, warn: (message: string) => void): void => {
  if (Object.keys(host.rawStyle).length > 0) {
    warn(`ngpdf: styles on <${host.tag}> are ignored; style a pdf-* element inside it`);
  }
};

/**
 * A copy of `node` under `parent`, at nesting `depth`, with every host below it replaced by its
 * children. `node` itself is copied whatever it is.
 */
export function copyWithoutHosts(
  node: PdfNode,
  parent: PdfNode | null,
  depth: number,
  warn: (message: string) => void,
): PdfNode {
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
      ignoreStyle(child, warn);
      // Not push(...children): spreading a host with a huge number of rows overflows too.
      for (const grandchild of [...child.children].reverse()) pending.push(grandchild);
    } else if (child.kind !== 'element' || !isHidden(child)) {
      // display: none drops the element and all it holds before anything reads them.
      out.children.push(copyWithoutHosts(child, out, depth + 1, warn));
    }
  }
  return out;
}

/**
 * A copy of the document's tree in which every component host is replaced by its children, like
 * CSS `display: contents`. Every later stage then sees pages under the document, rows under a
 * table and cells under a row however the template splits them into components. A host's own
 * style is dropped, with a warning. An element with `display: none` is left out with all it
 * holds, so no later stage lays it out, draws it or collects its anchors. The input tree is left
 * unchanged.
 */
export function dissolveHosts(document: PdfNode, warn: (message: string) => void): PdfNode {
  for (let above = document.parent; above; above = above.parent) {
    if (isHost(above)) ignoreStyle(above, warn);
  }
  // A hidden document keeps no pages, so the error below explains it.
  const root = isHidden(document)
    ? { ...document, parent: null, children: [] }
    : copyWithoutHosts(document, null, 1, warn);
  if (!root.children.some((child) => child.kind === 'element' && child.tag === 'pdf-page')) {
    throw new Error('ngpdf: pdf-document has no pdf-page');
  }
  return root;
}
