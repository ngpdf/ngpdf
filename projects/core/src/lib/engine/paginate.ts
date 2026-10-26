import { propsOf, type PdfNode } from '../tree/node';
import { layoutBox, type Box, type LayoutContext } from './layout';
import type { TextBlock } from './text';
import type { Edges, Length, ResolvedStyle } from './style';

export interface PlacedBox {
  readonly box: Box;
  /** Absolute page coordinates of the box's border-box origin; children stay relative to it. */
  readonly x: number;
  readonly y: number;
  /** Page y below which nothing of the box is drawn: a unit taller than the content area. */
  readonly clipBottom?: number;
  /** On a sliced decoration: this piece's top or bottom edge is a page cut, so no border there. */
  readonly sliceTop?: boolean;
  readonly sliceBottom?: boolean;
  /** Product of the opacities of the ancestors that are not part of `box` (default 1). */
  readonly opacity?: number;
}

export interface PageLayout {
  readonly width: number;
  readonly height: number;
  /** Units and repeated header rows, top to bottom. */
  readonly placed: readonly PlacedBox[];
  /** Page and wrapper backgrounds and borders, outer first, drawn before `placed`. */
  readonly decorations: readonly PlacedBox[];
  readonly pageNumber?: {
    readonly box: Box;
    readonly x: number;
    readonly y: number;
    readonly opacity?: number;
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
}

interface Header {
  readonly rows: readonly Flowed[];
  readonly top: number;
  readonly height: number;
  /** The table's gap, kept between a repeated header and the row under it. */
  readonly gap: number;
  /** Opacity of the table and its ancestors, which the header rows inherit. */
  readonly opacity: number;
}

interface Unit extends Flowed {
  /** Product of the opacities of the wrappers (and the page) above the unit. */
  readonly opacity: number;
  readonly bottom: number;
  readonly header: Header | null;
}

/** A column pdf-view or a table the units were taken from; it covers units first..last. */
interface Wrapper extends Flowed {
  /** Product of the opacities of the wrappers (and the page) above this one. */
  readonly opacity: number;
  readonly bottom: number;
  readonly first: number;
  last: number;
}

interface Collected {
  readonly units: Unit[];
  readonly wrappers: Wrapper[];
}

const ZERO_EDGES: Edges<Length> = { top: 0, right: 0, bottom: 0, left: 0 };
const NO_BORDER: Edges<number> = { top: 0, right: 0, bottom: 0, left: 0 };

function lengthIn(length: Length, base: number): number {
  if (length === 'auto') return 0;
  return typeof length === 'number' ? length : (length.percent / 100) * base;
}

/** An `opacity` entry only when it changes anything. */
function fade(opacity: number): { opacity?: number } {
  return opacity === 1 ? {} : { opacity };
}

function draws(style: ResolvedStyle): boolean {
  const { top, right, bottom, left } = style.borderWidth;
  return style.backgroundColor !== null || top + right + bottom + left > 0;
}

function isPageNumber(node: PdfNode): boolean {
  return node.kind === 'element' && node.tag === 'pdf-page-number';
}

function isWrapper(box: Box): boolean {
  if (box.children.length === 0) return false;
  return (
    box.node.tag === 'pdf-table' ||
    (box.node.tag === 'pdf-view' && box.style.flexDirection === 'column')
  );
}

/**
 * A text that may break between lines: long enough to leave `orphans` lines before a break and
 * `widows` after it, not kept whole with `break-inside: avoid`, and not of a fixed height.
 */
function isSplittable(box: Box): boolean {
  const { style, text } = box;
  return (
    text !== undefined &&
    text.lines.length >= style.orphans + style.widows &&
    style.breakInside !== 'avoid' &&
    style.height === 'auto' &&
    style.maxHeight === 'auto'
  );
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
function collectUnits(content: Box, maxHeader: number, pageOpacity: number): Collected {
  const units: Unit[] = [];
  const wrappers: Wrapper[] = [];

  const visit = (
    box: Box,
    x: number,
    top: number,
    header: Header | null,
    opacity: number,
  ): void => {
    if (box.text && isSplittable(box)) {
      visitText(box, box.text, x, top, header, opacity);
      return;
    }
    if (!isWrapper(box)) {
      units.push({ box, x, top, bottom: top + box.h, header, opacity });
      return;
    }
    const wrapper: Wrapper = {
      box,
      x,
      top,
      opacity,
      bottom: top + box.h,
      first: units.length,
      last: 0,
    };
    const inside = opacity * box.style.opacity;
    wrappers.push(wrapper);
    let children = box.children;
    let childHeader = header;
    if (box.node.tag === 'pdf-table') {
      const isHeader = (child: Box): boolean => isHeaderRow(child.node);
      const body = children.filter((child) => !isHeader(child));
      // A table of header rows only has nothing to repeat over: its rows are plain units.
      if (body.length > 0 && body.length < children.length) {
        const rows = children
          .filter(isHeader)
          .map((child) => ({ box: child, x: x + child.x, top: top + child.y }));
        const headerTop = Math.min(...rows.map((r) => r.top));
        const headerBottom = Math.max(...rows.map((r) => r.top + r.box.h));
        if (headerBottom - headerTop <= maxHeader + EPSILON) {
          childHeader = {
            rows,
            top: headerTop,
            height: headerBottom - headerTop,
            gap: box.style.gap,
            opacity: inside,
          };
          children = body;
        }
      }
    }
    for (const child of children) visit(child, x + child.x, top + child.y, childHeader, inside);
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
    opacity: number,
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
      children: [],
    };
    const wrapper: Wrapper = {
      box: decoration,
      x,
      top,
      opacity,
      bottom: top + box.h,
      first: units.length,
      last: 0,
    };
    wrappers.push(wrapper);
    const left = box.padding.left + box.border.left;
    const right = box.padding.right + box.border.right;
    const inner = top + box.padding.top + box.border.top;
    const style: ResolvedStyle = {
      ...box.style,
      padding: ZERO_EDGES,
      borderWidth: NO_BORDER,
      backgroundColor: null,
      breakBefore: false,
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
        opacity,
      });
    }
    wrapper.last = units.length - 1;
  };

  if (content.style.flexDirection === 'row') {
    // The unit is the content box itself, whose style already carries the page's opacity; the
    // display list applies it, so passing pageOpacity here would fade the page twice.
    units.push({ box: content, x: 0, top: 0, bottom: content.h, header: null, opacity: 1 });
  } else {
    for (const child of content.children) visit(child, child.x, child.y, null, pageOpacity);
  }
  return { units, wrappers };
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

/** Whether a pdf-page-number sits anywhere below the page's direct children. */
function hasNestedPageNumber(page: PdfNode): boolean {
  const below = (node: PdfNode): boolean =>
    node.children.some((child) => isPageNumber(child) || below(child));
  return page.children.some((child) => !isPageNumber(child) && below(child));
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
}

/**
 * A unit is never split, so a break asked for anywhere inside it (a cell of a table row, a
 * text in a row view) breaks before the whole unit.
 */
function asksForBreak(box: Box): boolean {
  return box.style.breakBefore || box.children.some(asksForBreak);
}

function at<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`ngpdf: pagination lost unit ${String(index)}`);
  return item;
}

/**
 * Breaks one pdf-page's content into pages. The content is laid out once at the content width
 * with unbounded height; units keep the vertical offsets between them from that layout, and a
 * unit moved to a new page starts at the content top (after the padding and border of the
 * wrappers that open with it). A unit is never split.
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

  const numberNode = page.children.find(isPageNumber);
  if (hasNestedPageNumber(page)) warn('ngpdf: pdf-page-number must be a direct child of pdf-page');
  const numberBox = numberNode
    ? measurePageNumber(numberNode, styles, base.contentWidth, ctx)
    : undefined;
  const frame: PageFrame = { ...base, bottom: base.innerBottom - (numberBox?.h ?? 0) };
  const pageNumber = numberBox && {
    box: numberBox,
    x: frame.left,
    y: frame.bottom,
    ...fade(pageStyle.opacity),
  };

  // The content without the page number, laid out as a plain box at the content width.
  const content: PdfNode = { ...page, children: page.children.filter((c) => !isPageNumber(c)) };
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
  };
  const contentStyles = new Map(styles).set(content, contentStyle);
  const laid = layoutBox(content, contentStyles, frame.contentWidth, ctx);
  const contentHeight = frame.bottom - frame.top;
  const { units, wrappers } = collectUnits(laid, contentHeight, pageStyle.opacity);

  // Per unit: the outermost wrapper top opening at it, the outermost wrapper bottom closing at
  // it, and whether any of them asks for a page break.
  const opensAt = new Map<number, number>();
  const closesAt = new Map<number, number>();
  const breaksAt = new Set<number>();
  for (const wrapper of wrappers) {
    if (!opensAt.has(wrapper.first)) opensAt.set(wrapper.first, wrapper.top);
    if (!closesAt.has(wrapper.last)) closesAt.set(wrapper.last, wrapper.bottom);
    if (wrapper.box.style.breakBefore) breaksAt.add(wrapper.first);
  }

  const pages: PageBuilder[] = [];
  let current!: PageBuilder;
  let cursor = 0;
  // Flow bottom of the last unit placed on this page; null right after a page break.
  let previousBottom: number | null = 0;
  const startPage = (): void => {
    current = { placed: [], decorations: [], headers: new Set(), units: 0, lastUnit: -1 };
    pages.push(current);
    cursor = frame.top;
  };
  startPage();

  const placements: Placement[] = [];

  const place = (box: Box, x: number, y: number, opacity: number): void => {
    if (y + box.h > frame.bottom + EPSILON) {
      const what = isHeaderRow(box.node) ? `${box.node.tag} header` : box.node.tag;
      warn(`ngpdf: ${what} is taller than a page and is cut at the bottom`);
      current.placed.push({ box, x, y, clipBottom: frame.bottom, ...fade(opacity) });
    } else {
      current.placed.push({ box, x, y, ...fade(opacity) });
    }
  };

  units.forEach((unit, index) => {
    if ((breaksAt.has(index) || asksForBreak(unit.box)) && current.units > 0) {
      startPage();
      previousBottom = null;
    }
    const plan = () => {
      const header = unit.header && !current.headers.has(unit.header) ? unit.header : null;
      // A row that fits a page only without the header goes on its own page, at the top, without it.
      if (
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
    const trail = Math.max(0, (closesAt.get(index) ?? unit.bottom) - unit.bottom);
    if (next.top + unit.box.h + trail > frame.bottom + EPSILON && current.units > 0) {
      startPage();
      previousBottom = null;
      next = plan();
    }
    const { header, leadFlow, leadTop, top } = next;
    if (header) {
      for (const row of header.rows) {
        place(row.box, frame.left + row.x, leadTop + row.top - header.top, header.opacity);
      }
      current.headers.add(header);
    }
    place(unit.box, frame.left + unit.x, top, unit.opacity);
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

  if (draws(pageStyle)) {
    const box: Box = {
      node: page,
      style: pageStyle,
      x: 0,
      y: 0,
      w: frame.width,
      h: frame.height,
      padding: NO_BORDER,
      border: pageStyle.borderWidth,
      children: [],
    };
    for (const built of pages) built.decorations.push({ box, x: 0, y: 0 });
  }
  for (const wrapper of wrappers) {
    if (!draws(wrapper.box.style)) continue;
    const first = at(placements, wrapper.first);
    const last = at(placements, wrapper.last);
    for (let p = first.page; p <= last.page; p++) {
      const built = at(pages, p);
      const top = p === first.page ? Math.max(frame.top, wrapper.top + first.leadShift) : frame.top;
      const lastHere = p === last.page ? last : at(placements, built.lastUnit);
      // On a cut, the piece still covers the wrappers nested in it that close on this page.
      const end =
        p === last.page ? wrapper.bottom : (closesAt.get(built.lastUnit) ?? lastHere.unit.bottom);
      const bottom = Math.min(end + lastHere.unitShift, frame.bottom);
      built.decorations.push({
        box: { ...wrapper.box, h: Math.max(0, bottom - top), children: [] },
        x: frame.left + wrapper.x,
        y: top,
        sliceTop: p !== first.page,
        sliceBottom: p !== last.page,
        ...fade(wrapper.opacity),
      });
    }
  }

  return pages.map((built) => ({
    width: frame.width,
    height: frame.height,
    placed: built.placed,
    decorations: built.decorations,
    ...(pageNumber ? { pageNumber } : {}),
  }));
}
