import { propsOf, type PdfNode } from '../tree/node';
import type { PdfPerSheetContext, RenderPerSheet } from '../tree/per-sheet';
import type { AnchorMark, Anchors } from './anchors';
import { copyWithoutHosts } from './hosts';
import { layoutBox, type LayoutContext } from './layout';
import type { PlacedBox } from './paginate';
import type { ResolvedStyle } from './style';

const OUTSIDE = 'ngpdf: pdfPerSheet must be inside a fixed pdf-view';

// Float sums of line heights must not count as taller than the reservation.
const EPSILON = 1e-6;

/** The anchor comment a `pdfPerSheet` template leaves where it sits. */
export function isSlot(node: PdfNode): boolean {
  return node.kind === 'comment' && propsOf(node)['perSheet'] === true;
}

function hasSlot(node: PdfNode): boolean {
  return isSlot(node) || node.children.some(hasSlot);
}

function isFixedView(node: PdfNode): boolean {
  if (node.kind !== 'element' || node.tag !== 'pdf-view') return false;
  const side = propsOf(node)['fixed'];
  return side === 'top' || side === 'bottom';
}

export function sheetContext(sheet: number, total: number, page: number): PdfPerSheetContext {
  return { $implicit: sheet, sheet, total, first: sheet === 1, last: sheet === total, page };
}

/** A fixed view that holds `pdfPerSheet` templates, as it was before any of them rendered. */
export interface PerSheetView {
  /** The view with its slots, under the document's dissolved tree. */
  readonly template: PdfNode;
  /** The pdf-page it is a child of, in the tree `reserveSheets` returns. */
  readonly page: PdfNode;
  /** 1-based, in template order. */
  readonly pageNumber: number;
}

/** A filled view, and the node of the template each of its copied nodes came from. */
export interface FilledView {
  readonly view: PdfNode;
  readonly origins: ReadonlyMap<PdfNode, PdfNode>;
}

// document > page > view
const VIEW_DEPTH = 3;

/**
 * A copy of `template` under `parent` in which each slot is replaced by the nodes `render` gives
 * for it, with their component hosts dissolved. `template` is left unchanged.
 */
export function fillSlots(
  template: PdfNode,
  parent: PdfNode | null,
  context: PdfPerSheetContext,
  render: RenderPerSheet,
  warn: (message: string) => void,
): FilledView {
  const origins = new Map<PdfNode, PdfNode>();
  const copy = (node: PdfNode, under: PdfNode | null, depth: number): PdfNode => {
    const out: PdfNode = { ...node, parent: under, children: [] };
    origins.set(out, node);
    for (const child of node.children) {
      if (!isSlot(child)) {
        out.children.push(copy(child, out, depth + 1));
        continue;
      }
      // The rendered root stands where the slot was; its children take the slot's level.
      for (const rendered of copyWithoutHosts(render(child, context), out, depth, warn).children) {
        rendered.parent = out;
        out.children.push(rendered);
      }
    }
    return out;
  };
  return { view: copy(template, parent, VIEW_DEPTH), origins };
}

/**
 * The document with each `pdfPerSheet` template rendered once, as on the only sheet of a
 * one-sheet document, so that its fixed view reserves a height. `views` maps each filled view to
 * its template, for the renders on each sheet, and `origins` each copied node to the node it
 * copies. A slot anywhere but in a fixed view that is a direct child of a pdf-page throws. A
 * document without slots comes back as it is.
 */
export function reserveSheets(
  document: PdfNode,
  render: RenderPerSheet,
  warn: (message: string) => void,
): {
  readonly tree: PdfNode;
  readonly views: ReadonlyMap<PdfNode, PerSheetView>;
  readonly origins: ReadonlyMap<PdfNode, PdfNode>;
} {
  const views = new Map<PdfNode, PerSheetView>();
  const origins = new Map<PdfNode, PdfNode>();
  if (!hasSlot(document)) return { tree: document, views, origins };

  const shell = (node: PdfNode, parent: PdfNode | null): PdfNode => {
    const out: PdfNode = { ...node, parent, children: [] };
    origins.set(out, node);
    return out;
  };
  // A copy that refuses slots: they are allowed only where `page` handles them.
  const plain = (node: PdfNode, parent: PdfNode | null): PdfNode => {
    if (isSlot(node)) throw new Error(OUTSIDE);
    const out = shell(node, parent);
    for (const child of node.children) out.children.push(plain(child, out));
    return out;
  };
  let pageNumber = 0;
  const page = (node: PdfNode, parent: PdfNode): PdfNode => {
    pageNumber++;
    const out = shell(node, parent);
    for (const child of node.children) {
      if (!isFixedView(child) || !hasSlot(child)) {
        out.children.push(plain(child, out));
        continue;
      }
      const filled = fillSlots(child, out, sheetContext(1, 1, pageNumber), render, warn);
      for (const [copy, origin] of filled.origins) origins.set(copy, origin);
      views.set(filled.view, { template: child, page: out, pageNumber });
      out.children.push(filled.view);
    }
    return out;
  };
  const tree = shell(document, document.parent);
  for (const child of document.children) {
    const isPage = child.kind === 'element' && child.tag === 'pdf-page';
    tree.children.push(isPage ? page(child, tree) : plain(child, tree));
  }
  return { tree, views, origins };
}

/** The anchor marks of copied nodes, taken from the nodes they copy. */
export function marksOf(origins: ReadonlyMap<PdfNode, PdfNode>, anchors: Anchors): Anchors {
  if (origins.size === 0) return anchors;
  const marks = new Map<PdfNode, AnchorMark>();
  for (const [copy, origin] of origins) {
    const mark = anchors.marks.get(origin);
    if (mark) marks.set(copy, mark);
  }
  return { ...anchors, marks };
}

/**
 * Lays one sheet's filled view out in place of the reserved one: at the same place and width,
 * and in the reserved height. Content taller than the reservation is cut at its bottom, and
 * `taller` is told.
 */
export function placeSheetView(
  reserved: PlacedBox,
  view: PdfNode,
  styles: ReadonlyMap<PdfNode, ResolvedStyle>,
  width: number,
  ctx: LayoutContext,
  taller: () => void,
): PlacedBox {
  const height = reserved.box.h;
  let box = layoutBox(view, styles, width, ctx);
  if (box.h > height + EPSILON) taller();
  if (Math.abs(box.h - height) > EPSILON) {
    // Laid out again in the reserved height, so the view's own alignment and background hold.
    const style = styles.get(view);
    if (!style) throw new Error('ngpdf: no resolved style for a fixed <pdf-view>');
    const sized = { ...style, height, minHeight: 'auto', maxHeight: 'auto' } as const;
    box = layoutBox(view, new Map(styles).set(view, sized), width, ctx);
  }
  return { ...reserved, box: { ...box, x: 0, y: 0 }, clipBottom: reserved.y + height };
}
