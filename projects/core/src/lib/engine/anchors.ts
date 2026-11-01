import { propsOf, type PdfNode } from '../tree/node';
import { show } from './style';
import type { OutlineItem } from './writer';

/** What a box with an `anchor` or a `bookmark` carries to the display list. */
export interface AnchorMark {
  /** One per marked element, in tree order. */
  readonly id: number;
  /** The name links jump to; left out on a bookmark whose element holds no name. */
  readonly name?: string;
}

export interface Anchors {
  readonly marks: ReadonlyMap<PdfNode, AnchorMark>;
  /** Every name an internal link may point to. */
  readonly names: ReadonlySet<string>;
  /** The bookmarks, nested as the template nests their elements. */
  readonly outline: readonly OutlineItem[];
}

function trimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' ? undefined : text;
}

/**
 * The places of the document, in tree order: each element with an `anchor` name or a `bookmark`
 * title. An empty name or title is ignored. A name already taken goes to `warn`, and the element
 * that took it first keeps it.
 */
export function collectAnchors(root: PdfNode, warn?: (message: string) => void): Anchors {
  const marks = new Map<PdfNode, AnchorMark>();
  const names = new Set<string>();
  const outline: OutlineItem[] = [];

  // Items are built children first, so each level is collected in an array of its own.
  const visit = (node: PdfNode, siblings: OutlineItem[]): void => {
    if (node.kind !== 'element') return;
    const props = propsOf(node);
    let name = trimmed(props['anchor']);
    if (name !== undefined && names.has(name)) {
      warn?.(`ngpdf: duplicate anchor "${show(name)}"`);
      name = undefined;
    }
    const title = trimmed(props['bookmark']);
    let children = siblings;
    let mark: AnchorMark | undefined;
    if (name !== undefined || title !== undefined) {
      mark = { id: marks.size, ...(name !== undefined && { name }) };
      marks.set(node, mark);
      if (name !== undefined) names.add(name);
      if (title !== undefined) children = [];
    }
    for (const child of node.children) visit(child, children);
    if (mark && title !== undefined) siblings.push({ title, anchor: mark.id, children });
  };
  visit(root, outline);
  return { marks, names, outline };
}
