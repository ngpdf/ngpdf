import { propsOf, type PdfNode } from '../tree/node';
import { layoutBox, type Box, type LayoutContext } from './layout';
import type { TextBlock } from './text';
import type { Edges, Length, ResolvedStyle } from './style';

export interface PlacedBox {
  readonly box: Box;
  /** Absolute page coordinates of the box's border-box origin; children stay relative to it. */
  readonly x: number;
  readonly y: number;
  /**
   * Page y below which nothing of the box is drawn: a unit taller than the content area, or a
   * piece of a split table row, whose absolute boxes are cut at the bottom of the sheet.
   */
  readonly clipBottom?: number;
  /** On a sliced decoration: this piece's top or bottom edge is a page cut, so no border there. */
  readonly sliceTop?: boolean;
  readonly sliceBottom?: boolean;
  /** On a sliced decoration with a gradient: the piece's offset in the whole box and its height. */
  readonly slice?: { readonly offset: number; readonly height: number };
  /**
   * The faded boxes around `box`, outer first; each one's pieces on a sheet are drawn as one
   * group. A faded wrapper piece, text piece, or unit with absolute boxes taken out of it is the
   * last one, with opacity 1 in its own style, so the group around it is its only fade.
   */
  readonly groups?: readonly OpacityGroup[];
}

/** A box with `opacity` below 1, drawn with what it holds as one picture at that opacity. */
export interface OpacityGroup {
  readonly node: PdfNode;
  readonly opacity: number;
}

export interface PageLayout {
  readonly width: number;
  readonly height: number;
  /** The page's content area: the sheet less the page's padding and border. */
  readonly content: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  /** Units and repeated header rows, top to bottom. */
  readonly placed: readonly PlacedBox[];
  /** Page and wrapper backgrounds and borders, outer first, drawn before `placed`. */
  readonly decorations: readonly PlacedBox[];
  readonly pageNumber?: {
    readonly box: Box;
    readonly x: number;
    readonly y: number;
    readonly groups?: readonly OpacityGroup[];
  };
}

const PAGE_SIZES = new Map<string, readonly [number, number]>([
  ['A3', [841.89, 1190.55]],
  ['A4', [595.28, 841.89]],
  ['A5', [419.53, 595.28]],
  ['Letter', [612, 792]],
  ['Legal', [612, 1008]],
]);

// Float sums of row heights must not push a row that fits exactly onto the next page.
const EPSILON = 1e-6;

/** The page's size in points from its `size` and `orientation` props; landscape swaps them. */
export function pageSize(page: PdfNode): { width: number; height: number } {
  const props = propsOf(page);
  const size = props['size'] ?? 'A4';
  const label = typeof size === 'string' ? size : JSON.stringify(size);
  const pair = Array.isArray(size) ? size : PAGE_SIZES.get(label);
  const [width, height] = (pair ?? []) as unknown[];
  if (typeof width !== 'number' || typeof height !== 'number' || !(width > 0 && height > 0)) {
    throw new Error(`ngpdf: unknown page size "${label}" on pdf-page`);
  }
  return props['orientation'] === 'landscape'
    ? { width: height, height: width }
    : { width, height };
}

/** A box at its position in the full-height layout of the page content (the flow). */
interface Flowed {
  readonly box: Box;
  /** Relative to the content box's left edge. */
  readonly x: number;
  readonly top: number;
  /** The offsets of the relative boxes above it, which the flow ignores and drawing applies. */
  readonly dx: number;
  readonly dy: number;
}

interface Header {
  readonly rows: readonly Flowed[];
  readonly top: number;
  readonly height: number;
  /** The table's gap, kept between a repeated header and the row under it. */
  readonly gap: number;
  /** The faded table and its faded ancestors, around the header rows. */
  readonly groups: readonly OpacityGroup[];
}

interface Unit extends Flowed {
  /** The faded wrappers (and page) above the unit, and the unit itself when it is faded. */
  readonly groups: readonly OpacityGroup[];
  readonly bottom: number;
  readonly header: Header | null;
  /** A body row of a table that may split across sheets when it is taller than a page. */
  readonly splits?: true;
}

/** A column pdf-view or a table the units were taken from; it covers units first..last. */
interface Wrapper extends Flowed {
  /** The faded wrappers (and page) above this one. */
  readonly groups: readonly OpacityGroup[];
  readonly bottom: number;
  readonly first: number;
  last: number;
}

/** A split text: its line groups are units first..last. */
interface TextRun {
  readonly first: number;
  readonly last: number;
  readonly orphans: number;
  readonly widows: number;
}

/** An absolute box placed apart from the units: its containing block is split across sheets. */
interface Float extends Flowed {
  readonly groups: readonly OpacityGroup[];
}

/**
 * A pdf-note in the flow of a wrapper or the page: never a unit, it goes on the sheet of unit
 * `unit`, the first of the content after it or, when it is the last child, the last of the content
 * before it. -1 when the page has no units.
 */
interface NoteAt extends Flowed {
  readonly unit: number;
}

interface Collected {
  readonly units: Unit[];
  readonly wrappers: Wrapper[];
  readonly texts: TextRun[];
  readonly floats: Float[];
  readonly notes: NoteAt[];
}

const ZERO_EDGES: Edges<Length> = { top: 0, right: 0, bottom: 0, left: 0 };
const NO_BORDER: Edges<number> = { top: 0, right: 0, bottom: 0, left: 0 };

function lengthIn(length: Length, base: number): number {
  if (length === 'auto') return 0;
  return typeof length === 'number' ? length : (length.percent / 100) * base;
}

/** `groups` with the node added when its opacity fades it. */
function within(
  groups: readonly OpacityGroup[],
  node: PdfNode,
  opacity: number,
): readonly OpacityGroup[] {
  return opacity < 1 ? [...groups, { node, opacity }] : groups;
}

/** The box with opacity 1, once its group carries its opacity. */
function opaque(box: Box): Box {
  return box.style.opacity < 1 ? { ...box, style: { ...box.style, opacity: 1 } } : box;
}

/** A `groups` entry only when there is a group. */
function grouped(groups: readonly OpacityGroup[]): { groups?: readonly OpacityGroup[] } {
  return groups.length === 0 ? {} : { groups };
}

function draws(style: ResolvedStyle): boolean {
  const { top, right, bottom, left } = style.borderWidth;
  return (
    style.backgroundColor !== null ||
    style.backgroundImage !== null ||
    top + right + bottom + left > 0
  );
}

function isPageNumber(node: PdfNode): boolean {
  return node.kind === 'element' && node.tag === 'pdf-page-number';
}

function isAbsolute(box: Box): boolean {
  return box.style.position === 'absolute';
}

/** A note in the flow takes no space, so it is never a unit, nor part of one it is not in. */
function isFlowNote(box: Box): boolean {
  return box.node.tag === 'pdf-note' && !isAbsolute(box);
}

/** The index of the last child that is a unit or holds units, or -1. */
function lastInFlow(children: readonly Box[]): number {
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (child && !isAbsolute(child) && !isFlowNote(child)) return i;
  }
  return -1;
}

/** Whether the box is the containing block of its absolute descendants. */
function contains(box: Box): boolean {
  return box.style.position !== 'static' || box.style.transform.length > 0;
}

/**
 * A transformed box is drawn as a whole, so it is never split. A view of absolute boxes only has
 * no flow to split.
 */
function isWrapper(box: Box): boolean {
  const empty = box.children.every((child) => isAbsolute(child) || isFlowNote(child));
  if (box.style.transform.length > 0 || empty) return false;
  return (
    box.node.tag === 'pdf-table' ||
    // A clipping view is one unit, like a row view: its clip can't be cut across sheets.
    ((box.node.tag === 'pdf-view' || box.node.tag === 'pdf-link') &&
      box.style.flexDirection === 'column' &&
      box.style.overflow === 'visible')
  );
}

/**
 * A box that may be cut: not kept whole with `break-inside: avoid`, not of a fixed height, and
 * not transformed or clipped: one clip covers the whole box, padding included.
 */
function canBreak(style: ResolvedStyle): boolean {
  return (
    style.breakInside !== 'avoid' &&
    style.height === 'auto' &&
    style.maxHeight === 'auto' &&
    style.transform.length === 0 &&
    style.overflow === 'visible'
  );
}

/**
 * A text that may break between lines: one that can break at all, long enough to leave
 * `orphans` lines before a break and `widows` after it.
 */
function isSplittable(box: Box): boolean {
  const { style, text } = box;
  return text !== undefined && text.lines.length >= style.orphans + style.widows && canBreak(style);
}

/**
 * The line groups a text splits into, as `[first, end)` line ranges: the first `orphans` lines,
 * each line between, and the last `widows` lines. Units are never split, so a page break can only
 * fall where both limits hold.
 */
function lineGroups(count: number, orphans: number, widows: number): [number, number][] {
  const groups: [number, number][] = [[0, orphans]];
  for (let line = orphans; line < count - widows; line++) groups.push([line, line + 1]);
  groups.push([count - widows, count]);
  return groups;
}

function isHeaderRow(node: PdfNode): boolean {
  return propsOf(node)['header'] === true;
}

/**
 * Units in flow order, and the wrappers they came from in pre-order (outer first). A header
 * taller than `maxHeader` (the content area) is not repeated: its rows become plain units.
 */
function collectUnits(
  content: Box,
  maxHeader: number,
  pageGroups: readonly OpacityGroup[],
): Collected {
  const units: Unit[] = [];
  const wrappers: Wrapper[] = [];
  const texts: TextRun[] = [];
  const floats: Float[] = [];
  const notes: NoteAt[] = [];

  // Called in place of visiting the note, so `units.length` is the index of the next unit.
  const noteAt = (note: Flowed, before: boolean): void => {
    notes.push({ ...note, unit: before ? units.length : units.length - 1 });
  };

  /**
   * The unit's box without the absolute boxes whose containing block is outside it, which go to
   * `floats`: they are placed with the flow, not with the unit. Walks each unit once.
   */
  const detach = (box: Box, at: Float, contained: boolean): Box => {
    if (contained || box.children.length === 0) return box;
    // A box with a shift is relative and contains its absolute boxes, so none adds to dx or dy.
    const inside: Float = { ...at, box, groups: within(at.groups, box.node, box.style.opacity) };
    let changed = false;
    const kept: Box[] = [];
    for (const child of box.children) {
      const childAt = { ...inside, box: child, x: at.x + child.x, top: at.top + child.y };
      if (isAbsolute(child)) {
        floats.push(childAt);
        changed = true;
        continue;
      }
      const next = detach(child, childAt, contains(child));
      changed ||= next !== child;
      kept.push(next);
    }
    return changed ? { ...box, children: kept } : box;
  };

  const visit = (
    box: Box,
    x: number,
    top: number,
    header: Header | null,
    groups: readonly OpacityGroup[],
    dx: number,
    dy: number,
    inTable = false,
  ): void => {
    if (box.text && isSplittable(box)) {
      visitText(box, box.text, x, top, header, groups, dx, dy);
      return;
    }
    if (!isWrapper(box)) {
      const own = detach(box, { box, x, top, groups, dx, dy }, contains(box));
      // A header row that is not repeated stays whole, like one that is.
      const splits = inTable && box.node.tag === 'pdf-row' && !isHeaderRow(box.node);
      // A faded unit that lost absolute boxes to the flow gets its group here, so the group also
      // holds them; any other draws its own group, inside its transform.
      const taken = own !== box;
      units.push({
        box: taken ? opaque(own) : own,
        x,
        top,
        bottom: top + box.h,
        header,
        groups: taken ? within(groups, box.node, box.style.opacity) : groups,
        dx,
        dy,
        ...(splits && canBreak(box.style) && { splits }),
      });
      return;
    }
    const wrapper: Wrapper = {
      box,
      x,
      top,
      dx,
      dy,
      groups,
      bottom: top + box.h,
      first: units.length,
      last: 0,
    };
    const inside = within(groups, box.node, box.style.opacity);
    const innerDx = dx + (box.shift?.x ?? 0);
    const innerDy = dy + (box.shift?.y ?? 0);
    wrappers.push(wrapper);
    let children = box.children;
    let childHeader = header;
    if (box.node.tag === 'pdf-table') {
      const isHeader = (child: Box): boolean => isHeaderRow(child.node);
      const body = children.filter((child) => !isHeader(child));
      // A table of header rows only has nothing to repeat over: its rows are plain units.
      if (body.length > 0 && body.length < children.length) {
        const rows = children.filter(isHeader).map((child) => ({
          box: child,
          x: x + child.x,
          top: top + child.y,
          dx: innerDx,
          dy: innerDy,
        }));
        const headerTop = Math.min(...rows.map((r) => r.top));
        const headerBottom = Math.max(...rows.map((r) => r.top + r.box.h));
        if (headerBottom - headerTop <= maxHeader + EPSILON) {
          childHeader = {
            rows,
            top: headerTop,
            height: headerBottom - headerTop,
            gap: box.style.gap,
            groups: inside,
          };
          children = body;
        }
      }
    }
    const last = lastInFlow(children);
    for (const [i, child] of children.entries()) {
      const [childX, childTop] = [x + child.x, top + child.y];
      if (isFlowNote(child)) {
        noteAt({ box: child, x: childX, top: childTop, dx: innerDx, dy: innerDy }, i < last);
      } else if (isAbsolute(child)) {
        floats.push({
          box: child,
          x: childX,
          top: childTop,
          groups: inside,
          dx: innerDx,
          dy: innerDy,
        });
      } else {
        const inTable = box.node.tag === 'pdf-table';
        visit(child, childX, childTop, childHeader, inside, innerDx, innerDy, inTable);
      }
    }
    wrapper.last = units.length - 1;
  };

  // A splittable text is a wrapper whose units are its line groups. The wrapper keeps the text's
  // background and border, sliced per page like a column view's; each piece draws only its lines.
  const visitText = (
    box: Box,
    text: TextBlock,
    x: number,
    top: number,
    header: Header | null,
    groups: readonly OpacityGroup[],
    dx: number,
    dy: number,
  ): void => {
    const { node, style: boxStyle, w, h, padding, border } = box;
    const decoration: Box = {
      node,
      style: boxStyle,
      x: box.x,
      y: box.y,
      w,
      h,
      padding,
      border,
      ...(box.shift && { shift: box.shift }),
      children: [],
    };
    const wrapper: Wrapper = {
      box: decoration,
      x,
      top,
      dx,
      dy,
      groups,
      bottom: top + box.h,
      first: units.length,
      last: 0,
    };
    wrappers.push(wrapper);
    const pieceGroups = within(groups, node, boxStyle.opacity);
    const left = box.padding.left + box.border.left;
    const right = box.padding.right + box.border.right;
    const inner = top + box.padding.top + box.border.top;
    const style: ResolvedStyle = {
      ...box.style,
      padding: ZERO_EDGES,
      borderWidth: NO_BORDER,
      backgroundColor: null,
      backgroundImage: null,
      breakBefore: false,
      breakAfter: false,
      keepWithNext: false,
      // The text's group, with its background, carries its opacity.
      opacity: 1,
    };
    for (const [first, end] of lineGroups(text.lines.length, box.style.orphans, box.style.widows)) {
      const lines = text.lines.slice(first, end);
      const start = lines[0]?.y ?? 0;
      const last = lines[lines.length - 1];
      const h = last ? last.y + last.height - start : 0;
      const piece: Box = {
        ...box,
        style,
        x: 0,
        y: 0,
        w: Math.max(0, box.w - left - right),
        h,
        padding: NO_BORDER,
        border: NO_BORDER,
        text: { ...text, lines: lines.map((line) => ({ ...line, y: line.y - start })), height: h },
        children: [],
      };
      units.push({
        box: piece,
        x: x + left,
        top: inner + start,
        bottom: inner + start + h,
        header,
        groups: pieceGroups,
        dx,
        dy,
      });
    }
    wrapper.last = units.length - 1;
    texts.push({
      first: wrapper.first,
      last: wrapper.last,
      orphans: box.style.orphans,
      widows: box.style.widows,
    });
  };

  if (content.style.flexDirection === 'row') {
    // The unit is the content box itself, in the page's group like the rest of the sheet.
    units.push({
      box: content,
      x: 0,
      top: 0,
      dx: 0,
      dy: 0,
      bottom: content.h,
      header: null,
      groups: pageGroups,
    });
  } else {
    const last = lastInFlow(content.children);
    for (const [i, child] of content.children.entries()) {
      if (isFlowNote(child)) {
        noteAt({ box: child, x: child.x, top: child.y, dx: 0, dy: 0 }, i < last);
      } else if (isAbsolute(child)) {
        floats.push({ box: child, x: child.x, top: child.y, groups: pageGroups, dx: 0, dy: 0 });
      } else {
        visit(child, child.x, child.y, null, pageGroups, 0, 0);
      }
    }
  }
  return { units, wrappers, texts, floats, notes };
}

interface PageFrame {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly contentWidth: number;
  /** Bottom of the content area above the page number's reserved height. */
  readonly bottom: number;
}

function frameOf(
  page: PdfNode,
  style: ResolvedStyle,
): Omit<PageFrame, 'bottom'> & {
  readonly innerBottom: number;
} {
  const { width, height } = pageSize(page);
  const pad = (side: keyof Edges<Length>): number =>
    lengthIn(style.padding[side], width) + style.borderWidth[side];
  return {
    width,
    height,
    left: pad('left'),
    top: pad('top'),
    contentWidth: Math.max(0, width - pad('left') - pad('right')),
    innerBottom: height - pad('bottom'),
  };
}

/** Whether the node or an ancestor sets `text-align`; the page number is right-aligned if not. */
function setsTextAlign(node: PdfNode): boolean {
  for (let current: PdfNode | null = node; current; current = current.parent) {
    if (current.rawStyle['text-align'] !== undefined) return true;
  }
  return false;
}

function fixedSide(node: PdfNode): 'top' | 'bottom' | undefined {
  if (node.kind !== 'element' || node.tag !== 'pdf-view') return undefined;
  const side = propsOf(node)['fixed'];
  return side === 'top' || side === 'bottom' ? side : undefined;
}

/** Whether a fixed pdf-view sits anywhere below the page's direct children. */
function hasNestedFixed(page: PdfNode): boolean {
  const below = (node: PdfNode): boolean =>
    node.children.some((child) => fixedSide(child) !== undefined || below(child));
  return page.children.some((child) => below(child));
}

/** The page number box: content-wide, one line of its font high unless sized, right-aligned. */
function measurePageNumber(
  node: PdfNode,
  styles: ReadonlyMap<PdfNode, ResolvedStyle>,
  width: number,
  ctx: LayoutContext,
): Box {
  const laid = layoutBox(node, styles, width, ctx);
  let style = laid.style;
  if (!setsTextAlign(node)) style = { ...style, textAlign: 'right' };
  let h = laid.h;
  if (style.height === 'auto') {
    const insets =
      lengthIn(style.padding.top, width) +
      lengthIn(style.padding.bottom, width) +
      style.borderWidth.top +
      style.borderWidth.bottom;
    h = Math.max(h, insets + style.fontSize * style.lineHeight);
  }
  return { ...laid, style, h, children: [] };
}

interface PageBuilder {
  readonly placed: PlacedBox[];
  readonly decorations: PlacedBox[];
  readonly headers: Set<Header>;
  units: number;
  /** Index of the last unit placed on this page. */
  lastUnit: number;
}

/** Where a unit went: its page, and page y minus flow y for it and for its header. */
interface Placement {
  readonly unit: Unit;
  readonly page: number;
  readonly unitShift: number;
  readonly leadShift: number;
  /** A split row: its sheet pieces in order, each with page y minus flow y from its flow top. */
  readonly pieces?: readonly {
    readonly page: number;
    readonly flowTop: number;
    readonly shift: number;
    /** Page y of the piece's bottom. */
    readonly bottom: number;
  }[];
}

/** Where a unit and its repeated header go on the current sheet. */
interface Plan {
  readonly header: Header | null;
  readonly leadFlow: number;
  readonly leadTop: number;
  readonly top: number;
}

/** An absolute box asks for no break: it is never a unit. */
function inFlow(box: Box): readonly Box[] {
  return box.children.some(isAbsolute) ? box.children.filter((c) => !isAbsolute(c)) : box.children;
}

/**
 * A unit is never split, so a break asked for anywhere inside it (a cell of a table row, a
 * text in a row view) breaks before the whole unit.
 */
function asksForBreak(box: Box): boolean {
  return box.style.breakBefore || inFlow(box).some(asksForBreak);
}

/** Like `asksForBreak`, for a break after the whole unit. */
function asksForBreakAfter(box: Box): boolean {
  return box.style.breakAfter || inFlow(box).some(asksForBreakAfter);
}

/** Like `asksForBreakAfter`, for `break-after: avoid`. */
function asksToKeepWithNext(box: Box): boolean {
  return box.style.keepWithNext || inFlow(box).some(asksToKeepWithNext);
}

function at<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`ngpdf: pagination lost unit ${String(index)}`);
  return item;
}

/** A cell of a row split across sheets, drawn from its top. */
interface SplitCell {
  readonly box: Box;
  /** Cell y's where a piece may end and the next one start, ascending, between 0 and `end`. */
  readonly breaks: readonly number[];
  /** The bottom of its content, with its bottom padding and border. */
  readonly end: number;
}

/** One sheet's piece of a split row: where each cell's piece starts and stops, in cell y. */
interface RowPiece {
  readonly first: boolean;
  readonly last: boolean;
  readonly h: number;
  readonly starts: readonly number[];
  readonly stops: readonly number[];
}

/**
 * A view, link or cell whose children may go on different sheets. Like a kept wrapper on the
 * page, one with `break-inside: avoid` that is taller than a page breaks anyway.
 */
function breaksBetween(box: Box, pageHeight: number): boolean {
  const { style } = box;
  const tag = box.node.tag;
  const kept = style.breakInside === 'avoid' && box.h <= pageHeight + EPSILON;
  return (
    (tag === 'pdf-view' || tag === 'pdf-link' || tag === 'pdf-cell') &&
    style.flexDirection === 'column' &&
    !kept &&
    canBreak({ ...style, breakInside: 'auto' })
  );
}

/**
 * The cell y's inside `box` (at cell y `top`) where a piece may end: between two lines of a text
 * and between two children of a column view. Orphans and widows don't apply in a cell.
 */
function collectBreaks(box: Box, top: number, pageHeight: number, out: number[]): void {
  if (box.text) {
    if (!canBreak(box.style)) return;
    const inner = top + box.padding.top + box.border.top;
    for (let i = 1; i < box.text.lines.length; i++) out.push(inner + at(box.text.lines, i).y);
    return;
  }
  if (!breaksBetween(box, pageHeight)) return;
  inFlow(box).forEach((child, i) => {
    if (i > 0) out.push(top + child.y);
    collectBreaks(child, top + child.y, pageHeight, out);
  });
}

/**
 * The cells of a row taller than a page, ready to split; null when none of them can break. A
 * cell's content pushed down by `justify-content` is moved back to its top: each piece is drawn
 * from the top.
 */
function splitCells(row: Box, pageHeight: number): SplitCell[] | null {
  const cells = inFlow(row).map((cell): SplitCell => {
    const inset = cell.padding.top + cell.border.top;
    const flow = inFlow(cell);
    const lead = Math.max(0, (flow[0]?.y ?? inset) - inset);
    const box: Box =
      lead > 0
        ? {
            ...cell,
            children: cell.children.map((c) => (isAbsolute(c) ? c : { ...c, y: c.y - lead })),
          }
        : cell;
    const contentBottom = flow.reduce((bottom, c) => Math.max(bottom, c.y + c.h - lead), inset);
    const end =
      cell.style.height !== 'auto' || cell.text
        ? cell.h
        : Math.min(cell.h, contentBottom + cell.padding.bottom + cell.border.bottom);
    const found: number[] = [];
    collectBreaks(box, 0, pageHeight, found);
    const breaks = [...new Set(found)]
      .filter((y) => y > EPSILON && y < end - EPSILON)
      .sort((a, b) => a - b);
    return { box, breaks, end };
  });
  return cells.some((cell) => cell.breaks.length > 0) ? cells : null;
}

/** The index of the first item above `value` in an ascending list, or its length. */
function firstAbove(list: readonly number[], value: number): number {
  let [lo, hi] = [0, list.length];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (at(list, mid) > value) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Where each cell's next piece stops, from `starts`, with `room` points for the cells. A cell
 * stops at its last break that fits; one that ends here also needs `reserve` below it. When a
 * cell with content left has no break that fits, the piece is null, unless `force` makes the cell
 * take its next piece anyway, to be cut at the bottom of the sheet.
 */
function nextStops(
  cells: readonly SplitCell[],
  starts: readonly number[],
  room: number,
  reserve: number,
  force: true,
): number[];
function nextStops(
  cells: readonly SplitCell[],
  starts: readonly number[],
  room: number,
  reserve: number,
  force: boolean,
): number[] | null;
function nextStops(
  cells: readonly SplitCell[],
  starts: readonly number[],
  room: number,
  reserve: number,
  force: boolean,
): number[] | null {
  const stops: number[] = [];
  for (const [i, cell] of cells.entries()) {
    const start = at(starts, i);
    const limit = start + room + EPSILON;
    if (start >= cell.end - EPSILON) {
      stops.push(start);
    } else if (cell.end + reserve <= limit) {
      stops.push(cell.end);
    } else {
      const fits = firstAbove(cell.breaks, limit) - 1;
      const next = firstAbove(cell.breaks, start + EPSILON);
      if (fits >= next) stops.push(at(cell.breaks, fits));
      else if (force) stops.push(cell.breaks[next] ?? cell.end);
      else return null;
    }
  }
  return stops;
}

/**
 * Marks a piece of a box cut by a sheet break: no border on the cut edges, and its anchor only on
 * the piece with its top.
 */
function cutPiece(
  box: Box,
  top: boolean,
  bottom: boolean,
  slice: { readonly offset: number; readonly height: number },
): Box {
  if (!top && !bottom) return box;
  const { anchor, ...rest } = box;
  return {
    ...(top || anchor === undefined ? rest : { ...rest, anchor }),
    cut: { top, bottom, ...(box.style.backgroundImage !== null && { slice }) },
  };
}

/**
 * The children of `box` (at cell y `top`) with a part in [from, to), placed in its piece that
 * starts at cell y `pieceTop`. `last` marks the piece that ends the cell.
 */
function sliceChildren(
  box: Box,
  top: number,
  pieceTop: number,
  from: number,
  to: number,
  last: boolean,
): Box[] {
  const kept: Box[] = [];
  for (const child of box.children) {
    const piece = sliceBox(child, top + child.y, pieceTop, from, to, last);
    if (piece) kept.push(piece);
  }
  return kept;
}

/**
 * The part of `box` (at cell y `top`) in [from, to), placed in a parent piece that starts at cell
 * y `parentTop`. A box across a cut is a text, cut between its lines, or a view, cut between its
 * children; everything else, and an absolute box, goes whole with the piece its top lands in. So
 * a note at a cut goes with the content after it. A box with its top at the very end of the cell,
 * such as a note that is its last child, goes on the piece that ends the cell.
 */
function sliceBox(
  box: Box,
  top: number,
  parentTop: number,
  from: number,
  to: number,
  last: boolean,
): Box | null {
  const bottom = top + box.h;
  const cutTop = top < from - EPSILON;
  const cutBottom = bottom > to + EPSILON;
  const atEnd = last && top <= to + EPSILON;
  const whole = top >= from - EPSILON && (top < to - EPSILON || atEnd);
  const across =
    (cutTop || cutBottom) &&
    !isAbsolute(box) &&
    (box.text !== undefined || box.children.length > 0) &&
    top < to - EPSILON &&
    bottom > from + EPSILON;
  if (!across) return whole ? { ...box, y: top - parentTop } : null;
  const pieceTop = Math.max(top, from);
  const piece: Box = { ...box, y: pieceTop - parentTop, h: Math.min(bottom, to) - pieceTop };
  const slice = { offset: pieceTop - top, height: box.h };
  if (box.text) {
    const inner = box.padding.top + box.border.top;
    const lines = box.text.lines.filter((line) => {
      const lineTop = top + inner + line.y;
      return lineTop >= from - EPSILON && lineTop < to - EPSILON;
    });
    const moved = lines.map((line) => ({ ...line, y: top + line.y - pieceTop }));
    return cutPiece({ ...piece, text: { ...box.text, lines: moved } }, cutTop, cutBottom, slice);
  }
  const children = sliceChildren(box, top, pieceTop, from, to, last);
  return cutPiece({ ...piece, children }, cutTop, cutBottom, slice);
}

/** A split row's piece: its cells all as tall as the piece, each holding its own part. */
function rowPieceBox(
  row: Box,
  cells: readonly SplitCell[],
  piece: RowPiece,
  offset: number,
  height: number,
): Box {
  const insetTop = row.padding.top + row.border.top;
  const insetBottom = row.padding.bottom + row.border.bottom;
  const y = piece.first ? insetTop : 0;
  const h = piece.h - y - (piece.last ? insetBottom : 0);
  const slice = {
    offset: Math.max(0, offset - insetTop),
    height: Math.max(0, height - insetTop - insetBottom),
  };
  const children = cells.map((cell, i) => {
    const from = at(piece.starts, i);
    const to = at(piece.stops, i);
    const pieceTop = piece.first ? 0 : from;
    // The piece that reaches the cell's end; later ones hold nothing of it.
    const ends = to >= cell.end - EPSILON && (piece.first || from < cell.end - EPSILON);
    const content = sliceChildren(cell.box, 0, pieceTop, from, to, ends);
    return cutPiece({ ...cell.box, y, h, children: content }, !piece.first, !piece.last, slice);
  });
  const { anchor, ...rest } = row;
  return {
    ...(piece.first && anchor !== undefined ? { ...rest, anchor } : rest),
    h: piece.h,
    children,
  };
}

/**
 * Breaks one pdf-page's content into pages. The content is laid out once at the content width
 * with unbounded height; units keep the vertical offsets between them from that layout, and a
 * unit moved to a new page starts at the content top (after the padding and border of the
 * wrappers that open with it). A unit is never split, except a table row taller than a page,
 * which goes in pieces, one per sheet.
 */
export function paginatePage(
  page: PdfNode,
  styles: ReadonlyMap<PdfNode, ResolvedStyle>,
  ctx: LayoutContext,
): PageLayout[] {
  const warn = (message: string): void => ctx.warn?.(message);
  const pageStyle = styles.get(page);
  if (!pageStyle) throw new Error('ngpdf: no resolved style for <pdf-page>');
  const base = frameOf(page, pageStyle);
  // A faded page is one group per sheet, with everything on it.
  const pageGroups = within([], page, pageStyle.opacity);

  const numberNode = page.children.find(isPageNumber);
  const numberBox = numberNode
    ? measurePageNumber(numberNode, styles, base.contentWidth, ctx)
    : undefined;
  const numberTop = base.innerBottom - (numberBox?.h ?? 0);
  const pageNumber = numberBox && {
    box: numberBox,
    x: base.left,
    y: numberTop,
    ...grouped(pageGroups),
  };

  // Fixed views are laid out once and drawn on every sheet; the flow gets the space between them.
  if (hasNestedFixed(page)) warn('ngpdf: a fixed pdf-view must be a direct child of pdf-page');
  const fixedViews: PlacedBox[] = [];
  const fixedBox = (node: PdfNode): { box: Box; top: number; bottom: number; left: number } => {
    const margin = styles.get(node)?.margin ?? ZERO_EDGES;
    const side = (edge: keyof Edges<Length>): number => lengthIn(margin[edge], base.contentWidth);
    const width = Math.max(0, base.contentWidth - side('left') - side('right'));
    const box = layoutBox(node, styles, width, ctx);
    return {
      box: { ...box, x: 0, y: 0 },
      top: side('top'),
      bottom: side('bottom'),
      left: side('left'),
    };
  };
  let top = base.top;
  for (const node of page.children.filter((child) => fixedSide(child) === 'top')) {
    const view = fixedBox(node);
    const y = top + view.top;
    fixedViews.push({ box: view.box, x: base.left + view.left, y, ...grouped(pageGroups) });
    top = y + view.box.h + view.bottom;
  }
  let bottom = numberTop;
  const bottoms: PlacedBox[] = [];
  for (const node of page.children.filter((child) => fixedSide(child) === 'bottom').reverse()) {
    const view = fixedBox(node);
    const y = bottom - view.bottom - view.box.h;
    bottoms.unshift({ box: view.box, x: base.left + view.left, y, ...grouped(pageGroups) });
    bottom = y - view.top;
  }
  fixedViews.push(...bottoms);
  if (bottom - top <= EPSILON)
    throw new Error('ngpdf: fixed views leave no room for content on pdf-page');
  const frame: PageFrame = { ...base, top, bottom };

  // The content without the page number and fixed views, laid out at the content width.
  const content: PdfNode = {
    ...page,
    children: page.children.filter((c) => !isPageNumber(c) && fixedSide(c) === undefined),
  };
  const contentStyle: ResolvedStyle = {
    ...pageStyle,
    width: 'auto',
    height: 'auto',
    minWidth: 'auto',
    minHeight: 'auto',
    maxWidth: 'auto',
    maxHeight: 'auto',
    margin: ZERO_EDGES,
    padding: ZERO_EDGES,
    borderWidth: NO_BORDER,
    backgroundColor: null,
    backgroundImage: null,
    opacity: 1,
  };
  const contentStyles = new Map(styles).set(content, contentStyle);
  const laid = layoutBox(content, contentStyles, frame.contentWidth, ctx);
  const contentHeight = frame.bottom - frame.top;
  // Yoga uses float32 positions. At A4 scale one ULP is around 6e-5pt;
  // a fixed 1e-6pt tolerance moves exact-fit units onto another sheet.
  const fitEpsilon = Math.max(EPSILON, Math.abs(frame.bottom) * 2 ** -23);
  const { units, wrappers, texts, floats, notes } = collectUnits(laid, contentHeight, pageGroups);

  // Per unit: the outermost wrapper top opening at it, the outermost wrapper bottom closing at
  // it, whether any of them asks for a page break before or after it or to stay with the next
  // unit, and the wrappers kept with `break-inside: avoid` that open at it, outer first.
  const opensAt = new Map<number, number>();
  const closesAt = new Map<number, number>();
  const breaksAt = new Set<number>();
  const breaksAfter = new Set<number>();
  const keepsAfter = new Set<number>();
  const keptAt = new Map<number, Wrapper[]>();
  for (const wrapper of wrappers) {
    if (!opensAt.has(wrapper.first)) opensAt.set(wrapper.first, wrapper.top);
    if (!closesAt.has(wrapper.last)) closesAt.set(wrapper.last, wrapper.bottom);
    if (wrapper.box.style.breakBefore) breaksAt.add(wrapper.first);
    if (wrapper.box.style.breakAfter) breaksAfter.add(wrapper.last);
    if (wrapper.box.style.keepWithNext) keepsAfter.add(wrapper.last);
    if (wrapper.box.style.breakInside === 'avoid') {
      keptAt.set(wrapper.first, [...(keptAt.get(wrapper.first) ?? []), wrapper]);
    }
  }

  const pages: PageBuilder[] = [];
  let current!: PageBuilder;
  let cursor = 0;
  // Flow bottom of the last unit placed on this page; null right after a page break.
  let previousBottom: number | null = 0;
  const startPage = (): void => {
    current = {
      placed: [...fixedViews],
      decorations: [],
      headers: new Set(),
      units: 0,
      lastUnit: -1,
    };
    pages.push(current);
    cursor = frame.top;
  };
  startPage();

  const placements: Placement[] = [];

  /**
   * The units a split text starts a page at, when its first group would go below `startTop`.
   * Placing the groups one by one can leave a page in the middle with fewer lines than the
   * limits ask for, so each page takes as many groups as fit while the rest of the text can
   * still be laid out within them. Null when no layout keeps the limits: the groups are then
   * placed one by one. Linear in the groups, plus a binary search per group.
   */
  const planText = (run: TextRun, startTop: number, fresh: boolean): Set<number> | null => {
    const count = run.last - run.first + 1;
    const group = (i: number): Unit => at(units, run.first + i);
    const linesBefore = [0];
    for (let i = 0; i < count; i++) {
      linesBefore.push(at(linesBefore, i) + (group(i).box.text?.lines.length ?? 0));
    }
    const lines = (i: number, k: number): number => at(linesBefore, k) - at(linesBefore, i);
    const last = group(count - 1);
    const trail = Math.max(0, (closesAt.get(run.last) ?? last.bottom) - last.bottom);
    // Page y of group i at the top of a new page, after the wrappers that open with it.
    const freshTop = (i: number): number =>
      frame.top + group(i).top - (opensAt.get(run.first + i) ?? group(i).top);
    // Whether groups i..k-1 fit on a page with group i at `top`.
    const fits = (i: number, k: number, top: number): boolean =>
      top + group(k - 1).bottom - group(i).top + (k === count ? trail : 0) <=
      frame.bottom + EPSILON;
    // A page ending before a break keeps `orphans` lines, one starting after a break `widows`.
    const need = (i: number): number => Math.max(run.orphans, i > 0 ? run.widows : 0);
    const endsHere = (i: number, top: number): boolean =>
      fits(i, count, top) && (i === 0 || lines(i, count) >= run.widows);
    // The largest k in [lo, hi] with test(k), for a test true up to some k and false after.
    const lastWhere = (lo: number, hi: number, test: (k: number) => boolean): number => {
      let found = lo - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (test(mid)) [found, lo] = [mid, mid + 1];
        else hi = mid - 1;
      }
      return found;
    };
    // Breaks after groups i..k-1 with k in this range keep the limits on that page and fit.
    const range = (i: number, top: number): [number, number] => [
      lastWhere(i, count - 1, (k) => lines(i, k) < need(i)) + 1,
      lastWhere(i + 1, count - 1, (k) => fits(i, k, top)),
    ];

    // ok[i]: groups i.. can be laid out within the limits, starting a page at group i.
    // okAfter[k]: how many of ok[k..count-1] hold, to test a range at once.
    const ok: boolean[] = new Array<boolean>(count).fill(false);
    const okAfter: number[] = new Array<number>(count + 1).fill(0);
    for (let i = count - 1; i > 0; i--) {
      const [lo, hi] = range(i, freshTop(i));
      ok[i] = endsHere(i, freshTop(i)) || (lo <= hi && at(okAfter, lo) - at(okAfter, hi + 1) > 0);
      okAfter[i] = at(okAfter, i + 1) + (ok[i] ? 1 : 0);
    }
    // okUpTo[k]: the largest j <= k with ok[j], or -1.
    const okUpTo: number[] = [];
    for (let k = 0; k < count; k++) okUpTo.push(ok[k] ? k : k > 0 ? at(okUpTo, k - 1) : -1);

    // Where the page starting at group i with i at `top` ends: as late as the limits allow.
    const pageEnd = (i: number, top: number): number => {
      if (endsHere(i, top)) return count;
      const [lo, hi] = range(i, top);
      const k = hi >= lo ? at(okUpTo, hi) : -1;
      return k >= lo ? k : -1;
    };

    const breaks = new Set<number>();
    let end = pageEnd(0, startTop);
    if (end < 0 && !fresh) {
      breaks.add(run.first);
      end = pageEnd(0, freshTop(0));
    }
    if (end < 0) return null;
    while (end < count) {
      breaks.add(run.first + end);
      end = pageEnd(end, freshTop(end));
    }
    return breaks;
  };
  const textAt = new Map(texts.map((run) => [run.first, run]));
  // While placing a split text: the units it starts a page at, or null to place it greedily.
  let textBreaks: Set<number> | null = null;
  let textFirst = -1;
  let textLast = -1;

  // `at` is in flow coordinates on the sheet; the offsets of relative boxes above are added after.
  const place = (
    at: Flowed,
    x: number,
    y: number,
    groups: readonly OpacityGroup[],
    on = current,
  ): void => {
    const { box } = at;
    const drawn = { box, x: x + at.dx, y: y + at.dy, ...grouped(groups) };
    if (y + box.h > frame.bottom + Math.max(EPSILON, Math.abs(frame.bottom) * 2 ** -23)) {
      const what = isHeaderRow(box.node) ? `${box.node.tag} header` : box.node.tag;
      warn(`ngpdf: ${what} is taller than a page and is cut at the bottom`);
      on.placed.push({ ...drawn, clipBottom: frame.bottom });
    } else {
      on.placed.push(drawn);
    }
  };

  const breaksBetween = (i: number): boolean =>
    breaksAfter.has(i) ||
    asksForBreakAfter(at(units, i).box) ||
    breaksAt.has(i + 1) ||
    asksForBreak(at(units, i + 1).box);
  // Whether unit i stays on a page with unit i + 1 (`break-after: avoid`).
  const joined = (i: number): boolean =>
    i + 1 < units.length &&
    (keepsAfter.has(i) || asksToKeepWithNext(at(units, i).box)) &&
    !breaksBetween(i);
  // A kept wrapper opening at unit i that fits a page, with the bottom it needs.
  const keptBottom = (wrapper: Wrapper): number =>
    Math.max(wrapper.bottom, closesAt.get(wrapper.last) ?? wrapper.bottom);
  const keptHere = (i: number): Wrapper | undefined =>
    keptAt.get(i)?.find((wrapper) => keptBottom(wrapper) - wrapper.top <= contentHeight + EPSILON);

  const placeHeader = (header: Header | null, leadTop: number): void => {
    if (!header) return;
    for (const row of header.rows) {
      place(row, frame.left + row.x, leadTop + row.top - header.top, header.groups);
    }
    current.headers.add(header);
  };

  /**
   * Places a row taller than a page in pieces, one per sheet, from `next` on the current sheet,
   * or from the top of the next one when a cell with content can't fit a piece here.
   */
  const splitRow = (
    index: number,
    unit: Unit,
    cells: readonly SplitCell[],
    planned: Plan,
    replan: () => Plan,
  ): void => {
    const row = unit.box;
    const insetTop = row.padding.top + row.border.top;
    const insetBottom = row.padding.bottom + row.border.bottom;
    // The last piece keeps the row's bottom inset and the wrappers closing with it on its sheet.
    const reserve = insetBottom + Math.max(0, (closesAt.get(index) ?? unit.bottom) - unit.bottom);
    const room = (top: number, first: boolean): number =>
      frame.bottom - top - (first ? insetTop : 0);
    let next = planned;
    let starts: readonly number[] = cells.map(() => 0);
    const here = nextStops(cells, starts, room(next.top, true), reserve, current.units === 0);
    if (!here) {
      startPage();
      next = replan();
    }
    let stops = here ?? nextStops(cells, starts, room(next.top, true), reserve, true);
    const pieces: (RowPiece & { built: PageBuilder; page: number; plan: Plan })[] = [];
    for (;;) {
      const first = pieces.length === 0;
      const last = cells.every((cell, i) => at(stops, i) >= cell.end - EPSILON);
      let content = 0;
      for (const [i, stop] of stops.entries()) content = Math.max(content, stop - at(starts, i));
      const h = (first ? insetTop : 0) + content + (last ? insetBottom : 0);
      placeHeader(next.header, next.leadTop);
      pieces.push({
        first,
        last,
        h,
        starts,
        stops,
        built: current,
        page: pages.length - 1,
        plan: next,
      });
      current.units++;
      current.lastUnit = index;
      if (last) break;
      starts = stops;
      startPage();
      next = replan();
      stops = nextStops(cells, starts, room(next.top, false), reserve, true);
    }
    // The pieces go in after their sheets' headers; a gradient runs over them end to end.
    const height = pieces.reduce((sum, piece) => sum + piece.h, 0);
    const sliced = pieces.length > 1 && row.style.backgroundImage !== null;
    let offset = 0;
    for (const piece of pieces) {
      const top = piece.plan.top;
      if (top + piece.h > frame.bottom + EPSILON) {
        warn(`ngpdf: ${row.node.tag} is taller than a page and is cut at the bottom`);
      }
      piece.built.placed.push({
        box: rowPieceBox(row, cells, piece, offset, height),
        x: frame.left + unit.x + unit.dx,
        y: top + unit.dy,
        clipBottom: frame.bottom,
        sliceTop: !piece.first,
        sliceBottom: !piece.last,
        ...(sliced && { slice: { offset, height } }),
        ...grouped(unit.groups),
      });
      offset += piece.h;
    }
    const head = at(pieces, 0);
    const tail = at(pieces, pieces.length - 1);
    cursor = tail.plan.top + tail.h;
    previousBottom = unit.bottom;
    placements.push({
      unit,
      page: head.page,
      unitShift: head.plan.top - unit.top,
      leadShift: head.plan.leadTop - head.plan.leadFlow,
      pieces: pieces.map((piece) => {
        // A later piece starts where the cell that is furthest behind resumes.
        let start = piece.first ? 0 : Infinity;
        for (const [i, cell] of cells.entries()) {
          const from = at(piece.starts, i);
          if (from < cell.end - EPSILON) start = Math.min(start, insetTop + from);
        }
        const flowTop = unit.top + start;
        return {
          page: piece.page,
          flowTop,
          shift: piece.plan.top - flowTop,
          bottom: piece.plan.top + piece.h,
        };
      }),
    });
  };

  units.forEach((unit, index) => {
    const before = units[index - 1];
    const afterPrevious = breaksAfter.has(index - 1) || (before && asksForBreakAfter(before.box));
    if ((breaksAt.has(index) || asksForBreak(unit.box) || afterPrevious) && current.units > 0) {
      startPage();
      previousBottom = null;
    }
    // A row taller than a page below its header splits, when its cells can break.
    const below = unit.header ? unit.header.height + unit.header.gap : 0;
    const cells =
      unit.splits && unit.box.h > contentHeight - below + EPSILON
        ? splitCells(unit.box, contentHeight)
        : null;
    const plan = (): Plan => {
      const header = unit.header && !current.headers.has(unit.header) ? unit.header : null;
      // A row that fits a page only without the header goes on its own page, at the top, without it.
      if (
        !cells &&
        header &&
        current.units === 0 &&
        header.height + header.gap + unit.box.h > contentHeight + EPSILON &&
        unit.box.h <= contentHeight + EPSILON
      ) {
        // The rest of the page continues the table without a header.
        current.headers.add(header);
        return { header: null, leadFlow: unit.top, leadTop: cursor, top: cursor };
      }
      const leadFlow = header ? Math.min(header.top, unit.top) : unit.top;
      const anchor = previousBottom ?? opensAt.get(index) ?? leadFlow;
      const leadTop = cursor + leadFlow - anchor;
      const top = header ? leadTop + header.height + header.gap : leadTop;
      return { header, leadFlow, leadTop, top };
    };
    let next = plan();
    // The outermost kept wrapper opening here that fits a page moves whole to the next page when
    // it does not fit on this one. One taller than a page splits as if it were not kept.
    const kept = keptHere(index);
    if (
      kept &&
      current.units > 0 &&
      next.top - unit.top + keptBottom(kept) > frame.bottom + EPSILON
    ) {
      startPage();
      previousBottom = null;
      next = plan();
    }
    // A chain of units joined by `break-after: avoid`, with the unit after it, moves to the next
    // page when it does not fit here but fits a page. Only where the chain starts, so a chain too
    // tall for a page is never cut down to the part that fits.
    // The tail of a text that began on an earlier page stays where its plan put it: moving it
    // could leave the page before with fewer lines than `orphans` and `widows` ask for.
    const carriedTail =
      index > textFirst && index <= textLast && at(placements, textFirst).page < pages.length - 1;
    if (joined(index) && !(index > 0 && joined(index - 1)) && current.units > 0 && !carriedTail) {
      let end = index + 1;
      while (joined(end)) end++;
      let chainBottom = 0;
      for (let k = index; k <= end; k++) {
        const member = at(units, k);
        const wrapper = keptHere(k);
        chainBottom = Math.max(
          chainBottom,
          closesAt.get(k) ?? member.bottom,
          member.bottom,
          wrapper ? keptBottom(wrapper) : 0,
        );
      }
      const chainTop = opensAt.get(index) ?? unit.top;
      // On the next page, rows of a table get its header repeated above them, unless the chain
      // opens with the table and already spans the header.
      const repeated =
        unit.header && unit.header.top < chainTop ? unit.header.height + unit.header.gap : 0;
      if (
        chainBottom - chainTop + repeated <= contentHeight + EPSILON &&
        next.top - unit.top + chainBottom > frame.bottom + EPSILON
      ) {
        startPage();
        previousBottom = null;
        next = plan();
      }
    }
    const run = textAt.get(index);
    if (run) {
      textBreaks = unit.header ? null : planText(run, next.top, current.units === 0);
      textFirst = run.first;
      textLast = run.last;
    }
    if (cells) {
      splitRow(index, unit, cells, next, () => {
        previousBottom = null;
        return plan();
      });
      return;
    }
    const planned = index <= textLast ? textBreaks : null;
    const trail = Math.max(0, (closesAt.get(index) ?? unit.bottom) - unit.bottom);
    const overflows = next.top + unit.box.h + trail > frame.bottom + fitEpsilon;
    if ((planned ? planned.has(index) : overflows) && current.units > 0) {
      startPage();
      previousBottom = null;
      next = plan();
    }
    const { header, leadFlow, leadTop, top } = next;
    placeHeader(header, leadTop);
    place(unit, frame.left + unit.x, top, unit.groups);
    current.units++;
    current.lastUnit = index;
    cursor = top + unit.box.h;
    previousBottom = unit.bottom;
    placements.push({
      unit,
      page: pages.length - 1,
      unitShift: top - unit.top,
      leadShift: leadTop - leadFlow,
    });
  });

  // An absolute box goes on the sheet where its top lands, moved like the unit at or above that
  // flow y. One whose top falls below that sheet goes to the top of the next unit's sheet.
  // Placements are in flow order, so each box is a binary search.
  for (const float of floats) {
    let lo = 0;
    let hi = placements.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (at(placements, mid).unit.top <= float.top + EPSILON) [found, lo] = [mid, mid + 1];
      else hi = mid - 1;
    }
    const above = placements[Math.max(0, found)];
    // In a split row, the piece the box's top lands in.
    const pieces = above?.pieces ?? [];
    let piece = pieces[0];
    for (const candidate of pieces) if (candidate.flowTop <= float.top + EPSILON) piece = candidate;
    let page = piece?.page ?? above?.page ?? 0;
    let y = float.top + (piece?.shift ?? above?.unitShift ?? frame.top);
    if (y >= frame.bottom - EPSILON) {
      const below = placements[found + 1];
      if (below) {
        page = below.page;
        y = float.top + below.unitShift;
      } else {
        startPage();
        page = pages.length - 1;
        y = frame.top;
      }
    }
    // Never above the content top, as a unit moved to a new sheet.
    place(float, frame.left + float.x, Math.max(frame.top, y), float.groups, at(pages, page));
  }

  // A note goes on the sheet of the unit it is attached to, moved as that unit was. Rows in a
  // table have no margins, so a table's first row moves as its repeated header does. For a split
  // row, that is the piece where the note's point falls: the last one for a note after the row.
  for (const note of notes) {
    const placement = placements[note.unit];
    let piece = placement?.pieces?.[0];
    for (const candidate of placement?.pieces ?? []) {
      if (candidate.flowTop <= note.top + EPSILON) piece = candidate;
    }
    const shift = piece?.shift ?? placement?.unitShift ?? frame.top;
    at(pages, piece?.page ?? placement?.page ?? 0).placed.push({
      box: note.box,
      x: frame.left + note.x + note.dx,
      y: note.top + shift + note.dy,
    });
  }

  if (draws(pageStyle)) {
    const box: Box = {
      node: page,
      style: { ...pageStyle, opacity: 1 },
      x: 0,
      y: 0,
      w: frame.width,
      h: frame.height,
      padding: NO_BORDER,
      border: pageStyle.borderWidth,
      children: [],
    };
    for (const built of pages) built.decorations.push({ box, x: 0, y: 0, ...grouped(pageGroups) });
  }
  for (const wrapper of wrappers) {
    // A link's area and an anchor's place are drawn with its pieces, so such a wrapper always has
    // them.
    const marked = wrapper.box.link !== undefined || wrapper.box.anchor !== undefined;
    // Debug outlines draw every wrapper, so its pieces are kept; they change no position.
    if (!draws(wrapper.box.style) && !marked && !ctx.debug) continue;
    const first = at(placements, wrapper.first);
    const last = at(placements, wrapper.last);
    const lastPage = last.pieces?.at(-1)?.page ?? last.page;
    // `full` is the piece's height before the page bottom cuts it.
    const pieces: { page: number; top: number; h: number; full: number }[] = [];
    for (let p = first.page; p <= lastPage; p++) {
      const built = at(pages, p);
      const top = p === first.page ? Math.max(frame.top, wrapper.top + first.leadShift) : frame.top;
      const lastHere = p === lastPage ? last : at(placements, built.lastUnit);
      // On a cut, the piece still covers the wrappers nested in it that close on this page.
      const flowEnd =
        p === lastPage ? wrapper.bottom : (closesAt.get(built.lastUnit) ?? lastHere.unit.bottom);
      // A row split across sheets ends with its piece there, and its last piece ends the row.
      const rowPieces = lastHere.pieces ?? [];
      const lastPiece = rowPieces.at(-1);
      const piece = rowPieces.find((candidate) => candidate.page === p);
      let end = flowEnd + lastHere.unitShift;
      if (piece && piece !== lastPiece) end = piece.bottom;
      else if (lastPiece) end = flowEnd - lastHere.unit.bottom + lastPiece.bottom;
      const full = Math.max(0, end - top);
      pieces.push({ page: p, top, h: Math.min(full, Math.max(0, frame.bottom - top)), full });
    }
    // A gradient runs once over the pieces put end to end, uncut, so each sheet shows its part.
    const cut = pieces.length > 1 || pieces.some((piece) => piece.full > piece.h + EPSILON);
    const sliced = cut && wrapper.box.style.backgroundImage !== null;
    const height = pieces.reduce((sum, piece) => sum + piece.full, 0);
    let offset = 0;
    for (const piece of pieces) {
      at(pages, piece.page).decorations.push({
        box: { ...opaque(wrapper.box), h: piece.h, children: [] },
        x: frame.left + wrapper.x + wrapper.dx,
        y: piece.top + wrapper.dy,
        sliceTop: piece.page !== first.page,
        sliceBottom: piece.page !== lastPage,
        ...(sliced && { slice: { offset, height } }),
        ...grouped(within(wrapper.groups, wrapper.box.node, wrapper.box.style.opacity)),
      });
      offset += piece.full;
    }
  }

  return pages.map((built) => ({
    width: frame.width,
    height: frame.height,
    content: {
      x: base.left,
      y: base.top,
      w: base.contentWidth,
      h: Math.max(0, base.innerBottom - base.top),
    },
    placed: built.placed,
    decorations: built.decorations,
    ...(pageNumber ? { pageNumber } : {}),
  }));
}
