import { propsOf } from '../tree/node';
import { toHex, type Color } from './color';
import { fontChain, fontFor, shapeText, type FontRegistry } from './fonts';
import { fitImage } from './images';
import type { Box } from './layout';
import type { PageLayout, PlacedBox } from './paginate';
import type { ResolvedStyle } from './style';
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

const DEFAULT_FORMAT = '{page} / {total}';

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
function drawBox(
  box: Box,
  x: number,
  y: number,
  limit: number,
  cuts: Cuts,
  inherited: number,
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
    drawBox(child, x + child.x, y + child.y, limit, nested, opacity, out);
  }

  const ink = paint(style.color, opacity);
  if (box.text && ink) {
    const lineHeight = style.fontSize * style.lineHeight;
    for (const textLine of box.text.lines) {
      const lineTop = contentTop + textLine.y;
      if (lineTop + lineHeight > limit + 1e-6) continue;
      const lineLeft = alignedX(contentLeft, contentWidth, textLine.width, style.textAlign);
      for (const run of textLine.runs) {
        out.push({
          op: 'text',
          x: lineLeft + run.x,
          y: lineTop,
          text: run.text,
          font: run.font,
          size: style.fontSize,
          ...ink,
          underline: style.textDecoration === 'underline',
          strike: style.textDecoration === 'line-through',
        });
      }
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

function drawPlaced(placed: PlacedBox, out: DrawOp[]): void {
  drawBox(
    placed.box,
    placed.x,
    placed.y,
    placed.clipBottom ?? Infinity,
    { top: placed.sliceTop === true, bottom: placed.sliceBottom === true },
    placed.opacity ?? 1,
    out,
  );
}

/**
 * The draw operations of one page, in paint order: decorations, then the placed units, then the
 * page number. Within a box: background, borders, children, then its own text and image.
 */
export function displayList(
  page: PageLayout,
  pageIndex: number,
  pageCount: number,
  pageNumberFormat: string | undefined,
  options: DisplayListOptions,
): DrawOp[] {
  const out: DrawOp[] = [];
  for (const decoration of page.decorations) drawPlaced(decoration, out);
  for (const placed of page.placed) drawPlaced(placed, out);

  if (page.pageNumber) {
    const { box, x, y } = page.pageNumber;
    const opacity = page.pageNumber.opacity ?? 1;
    drawBox(box, x, y, Infinity, { top: false, bottom: false }, opacity, out);
    const { style } = box;
    const ink = paint(style.color, opacity * style.opacity);
    if (ink) {
      const format = pageNumberFormat ?? stringProp(propsOf(box.node)['format']) ?? DEFAULT_FORMAT;
      const filled = format
        .replaceAll('{page}', () => String(pageIndex + 1))
        .replaceAll('{total}', () => String(pageCount));
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
        runs.push({ text, font, width: options.metrics.widthOf(text, font, style.fontSize) });
        from = to;
      }
      const left = box.padding.left + box.border.left;
      const top = box.padding.top + box.border.top;
      const contentWidth = Math.max(0, box.w - left - box.padding.right - box.border.right);
      const width = runs.reduce((sum, run) => sum + run.width, 0);
      let runX = alignedX(x + left, contentWidth, width, style.textAlign);
      for (const run of runs) {
        out.push({
          op: 'text',
          x: runX,
          y: y + top,
          text: run.text,
          font: run.font,
          size: style.fontSize,
          ...ink,
          underline: style.textDecoration === 'underline',
          strike: style.textDecoration === 'line-through',
        });
        runX += run.width;
      }
    }
  }
  return out;
}

function stringProp(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
