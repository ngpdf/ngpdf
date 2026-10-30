import { toHex, type Color } from './color';
import { fontChain, fontFor, shapeText, type FontRegistry } from './fonts';
import { graphemeCount } from './graphemes';
import { fitImage } from './images';
import { pageNumberFormat, type Box } from './layout';
import type { PageLayout, PlacedBox } from './paginate';
import type { ResolvedStyle } from './style';
import { wordGaps, type TextLine } from './text';
import type { DrawOp, FontMetrics } from './writer';

export interface DisplayListOptions {
  /** Measures the page number text. */
  readonly metrics: FontMetrics;
  /** Receives the characters of the page number format that WinAnsi cannot show. */
  readonly warn?: (chars: string[]) => void;
  /** Registered font faces, for a page number in a registered family. */
  readonly fonts?: FontRegistry;
  /** Receives the characters of the page number that no font in its family has. */
  readonly warnMissing?: (chars: string[]) => void;
}

/** The op color and opacity for `color`; null when its alpha leaves nothing to paint. */
function paint(color: Color, opacity: number): { color: string; opacity: number } | null {
  if (color.a <= 0) return null;
  return { color: toHex(color), opacity: opacity * color.a };
}

interface Cuts {
  readonly top: boolean;
  readonly bottom: boolean;
}

/**
 * Clipping: a clipped box carries `limit`, the page y below which nothing is drawn. Rects and
 * lines are shortened to it, text lines that would end below it are dropped, and images get
 * their `clip` rectangle cut at it. No op gained a clip field.
 */
/** What a pdf-page-number needs to draw its text on one sheet. */
interface Numbering {
  readonly pageIndex: number;
  readonly pageCount: number;
  /** Overrides every page number's own format. */
  readonly format: string | undefined;
  readonly options: DisplayListOptions;
}

function drawBox(
  box: Box,
  x: number,
  y: number,
  limit: number,
  cuts: Cuts,
  inherited: number,
  numbering: Numbering,
  out: DrawOp[],
): void {
  const { style } = box;
  // Opacity multiplies down the tree, so a faded view fades what it holds.
  const opacity = inherited * style.opacity;

  const bottomEdge = Math.min(y + box.h, limit);
  const background = style.backgroundColor && paint(style.backgroundColor, opacity);
  if (background && bottomEdge > y) {
    out.push({
      op: 'rect',
      x,
      y,
      w: box.w,
      h: bottomEdge - y,
      radius: style.borderRadius,
      fill: background.color,
      opacity: background.opacity,
    });
  }

  const { top, right, bottom, left } = box.border;
  const color = style.borderColor;
  const line = (x1: number, y1: number, x2: number, y2: number, width: number, c: Color): void => {
    const cutY1 = Math.min(y1, limit);
    const cutY2 = Math.min(y2, limit);
    const stroke = paint(c, opacity);
    // A line wholly below the limit is gone; a vertical one is shortened.
    if (!stroke || (y1 >= limit && y2 >= limit)) return;
    out.push({ op: 'line', x1, y1: cutY1, x2, y2: cutY2, width, ...stroke });
  };
  if (top > 0 && !cuts.top) line(x, y + top / 2, x + box.w, y + top / 2, top, color.top);
  if (right > 0)
    line(x + box.w - right / 2, y, x + box.w - right / 2, y + box.h, right, color.right);
  if (bottom > 0 && !cuts.bottom) {
    line(x, y + box.h - bottom / 2, x + box.w, y + box.h - bottom / 2, bottom, color.bottom);
  }
  if (left > 0) line(x + left / 2, y, x + left / 2, y + box.h, left, color.left);

  // Padding plus border, as laid out.
  const inset = {
    top: box.padding.top + box.border.top,
    right: box.padding.right + box.border.right,
    bottom: box.padding.bottom + box.border.bottom,
    left: box.padding.left + box.border.left,
  };
  const contentLeft = x + inset.left;
  const contentTop = y + inset.top;
  const contentWidth = Math.max(0, box.w - inset.left - inset.right);
  const contentHeight = Math.max(0, box.h - inset.top - inset.bottom);

  for (const child of box.children) {
    const nested = { top: false, bottom: false };
    drawBox(child, x + child.x, y + child.y, limit, nested, opacity, numbering, out);
  }

  if (box.text) {
    for (const textLine of box.text.lines) {
      const lineTop = contentTop + textLine.y;
      if (lineTop + textLine.height > limit + 1e-6) continue;
      const lineLeft = alignedX(contentLeft, contentWidth, textLine.width, style.textAlign);
      const spacing = style.textAlign === 'justify' ? wordSpacing(textLine, contentWidth) : 0;
      let gapsBefore = 0;
      for (const run of textLine.runs) {
        const x = lineLeft + run.x + gapsBefore * spacing;
        const gaps = spacing > 0 ? wordGaps(run.text) : 0;
        gapsBefore += gaps;
        const ink = paint(run.color, opacity);
        if (!ink) continue;
        out.push({
          op: 'text',
          x,
          // Runs of different sizes share the line's baseline.
          y: lineTop + textLine.ascent - run.ascent,
          text: run.text,
          font: run.font,
          size: run.size,
          ...ink,
          underline: run.decoration === 'underline',
          strike: run.decoration === 'line-through',
          ...(gaps > 0 && { wordSpacing: spacing }),
          ...(run.letterSpacing !== 0 && { letterSpacing: run.letterSpacing }),
        });
      }
    }
  }

  if (box.node.tag === 'pdf-page-number') {
    const lineBottom = contentTop + style.fontSize * style.lineHeight;
    if (lineBottom <= limit + 1e-6) {
      drawPageNumber(box, contentLeft, contentTop, contentWidth, opacity, numbering, out);
    }
  }

  if (box.image) {
    const fitted = fitImage(box.image, { w: contentWidth, h: contentHeight }, style.objectFit);
    const clipHeight = Math.min(contentTop + contentHeight, limit) - contentTop;
    if (clipHeight > 0) {
      out.push({
        op: 'image',
        x: contentLeft + fitted.x,
        y: contentTop + fitted.y,
        w: fitted.w,
        h: fitted.h,
        clip: { x: contentLeft, y: contentTop, w: contentWidth, h: clipHeight },
        data: box.image.data,
        opacity,
      });
    }
  }
}

/**
 * The width a justified line adds to each word gap to reach the content width. The last line, a
 * line without gaps and one already too wide stay as laid out.
 */
function wordSpacing(line: TextLine, contentWidth: number): number {
  if (line.last) return 0;
  const gaps = line.runs.reduce((sum, run) => sum + wordGaps(run.text), 0);
  const extra = contentWidth - line.width;
  return gaps > 0 && extra > 0 ? extra / gaps : 0;
}

function alignedX(
  left: number,
  contentWidth: number,
  lineWidth: number,
  align: ResolvedStyle['textAlign'],
): number {
  if (align === 'right') return left + contentWidth - lineWidth;
  if (align === 'center') return left + (contentWidth - lineWidth) / 2;
  return left;
}

function drawPlaced(placed: PlacedBox, numbering: Numbering, out: DrawOp[]): void {
  drawBox(
    placed.box,
    placed.x,
    placed.y,
    placed.clipBottom ?? Infinity,
    { top: placed.sliceTop === true, bottom: placed.sliceBottom === true },
    placed.opacity ?? 1,
    numbering,
    out,
  );
}

/** A page number's text, filled in for the sheet and aligned in its content box on one line. */
function drawPageNumber(
  box: Box,
  left: number,
  top: number,
  contentWidth: number,
  opacity: number,
  numbering: Numbering,
  out: DrawOp[],
): void {
  const { style } = box;
  const { options } = numbering;
  const ink = paint(style.color, opacity);
  if (!ink) return;
  const format = numbering.format ?? pageNumberFormat(box.node);
  const filled = format
    .replaceAll('{page}', () => String(numbering.pageIndex + 1))
    .replaceAll('{total}', () => String(numbering.pageCount));
  const chain = options.fonts ? fontChain(style, options.fonts) : [fontFor(style)];
  const shaped = shapeText(filled, chain, options.metrics);
  if (shaped.replaced.length > 0) options.warn?.([...shaped.replaced]);
  if (shaped.missing.length > 0) options.warnMissing?.([...shaped.missing]);
  // The format is short: one op per font change is enough, no line breaking.
  const runs: { text: string; font: (typeof chain)[number]; width: number }[] = [];
  for (let from = 0; from < shaped.text.length;) {
    const index = shaped.fontAt[from] ?? 0;
    let to = from + 1;
    while (to < shaped.text.length && shaped.fontAt[to] === index) to++;
    const text = shaped.text.slice(from, to);
    const font = chain[index] ?? fontFor(style);
    const spacing = style.letterSpacing * graphemeCount(text);
    runs.push({ text, font, width: options.metrics.widthOf(text, font, style.fontSize) + spacing });
    from = to;
  }
  const width = runs.reduce((sum, run) => sum + run.width, 0);
  let runX = alignedX(left, contentWidth, width, style.textAlign);
  for (const run of runs) {
    out.push({
      op: 'text',
      x: runX,
      y: top,
      text: run.text,
      font: run.font,
      size: style.fontSize,
      ...ink,
      underline: style.textDecoration === 'underline',
      strike: style.textDecoration === 'line-through',
      ...(style.letterSpacing !== 0 && { letterSpacing: style.letterSpacing }),
    });
    runX += run.width;
  }
}

/**
 * The draw operations of one page, in paint order: decorations, then the placed units, then the
 * page number. Within a box: background, borders, children, then its own text and image.
 */
export function displayList(
  page: PageLayout,
  pageIndex: number,
  pageCount: number,
  formatOverride: string | undefined,
  options: DisplayListOptions,
): DrawOp[] {
  const out: DrawOp[] = [];
  const numbering: Numbering = { pageIndex, pageCount, format: formatOverride, options };
  for (const decoration of page.decorations) drawPlaced(decoration, numbering, out);
  for (const placed of page.placed) drawPlaced(placed, numbering, out);
  if (page.pageNumber) {
    const { box, x, y } = page.pageNumber;
    const cuts = { top: false, bottom: false };
    drawBox(box, x, y, Infinity, cuts, page.pageNumber.opacity ?? 1, numbering, out);
  }
  return out;
}
