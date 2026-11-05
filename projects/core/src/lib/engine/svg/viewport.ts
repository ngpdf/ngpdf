import type { Matrix } from '../writer';
import { parseNumberList } from './number';

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** `preserveAspectRatio`: where the viewBox sits (0, ½ or 1 of the spare room per axis), or none. */
export interface AspectRatio {
  readonly align: { readonly x: number; readonly y: number } | null;
  readonly slice: boolean;
}

export const DEFAULT_ASPECT: AspectRatio = { align: { x: 0.5, y: 0.5 }, slice: false };

/**
 * A `viewBox`: four numbers. Null when missing or invalid (SVG then has none); `'empty'` for a
 * width or height of 0, which turns drawing off.
 */
export function parseViewBox(text: string | undefined): ViewBox | 'empty' | null {
  if (text === undefined) return null;
  const numbers = parseNumberList(text);
  if (numbers?.length !== 4) return null;
  const [x = 0, y = 0, width = 0, height = 0] = numbers;
  if (width < 0 || height < 0) return null;
  if (width === 0 || height === 0) return 'empty';
  return { x, y, width, height };
}

const ALIGN = new Map([
  ['min', 0],
  ['mid', 0.5],
  ['max', 1],
]);

/** A `preserveAspectRatio` (`defer` is read past); null when invalid. */
export function parseAspectRatio(text: string | undefined): AspectRatio | null {
  if (text === undefined) return DEFAULT_ASPECT;
  const words = text.trim().split(/\s+/);
  if (words[0] === 'defer') words.shift();
  const [align = '', meet = 'meet', extra] = words;
  if (extra !== undefined || (meet !== 'meet' && meet !== 'slice')) return null;
  const slice = meet === 'slice';
  if (align === 'none') return { align: null, slice };
  const x = ALIGN.get(align.slice(1, 4).toLowerCase());
  const y = ALIGN.get(align.slice(5, 8).toLowerCase());
  const shaped = /^x(?:Min|Mid|Max)Y(?:Min|Mid|Max)$/.test(align);
  if (!shaped || x === undefined || y === undefined) return null;
  return { align: { x, y }, slice };
}

/** The matrix that fits `viewBox` into a viewport of `width` × `height` at (0, 0). */
export function viewBoxMatrix(
  viewBox: ViewBox,
  aspect: AspectRatio,
  width: number,
  height: number,
): Matrix {
  let sx = width / viewBox.width;
  let sy = height / viewBox.height;
  let tx = 0;
  let ty = 0;
  if (aspect.align) {
    const scale = aspect.slice ? Math.max(sx, sy) : Math.min(sx, sy);
    sx = scale;
    sy = scale;
    tx = (width - viewBox.width * scale) * aspect.align.x;
    ty = (height - viewBox.height * scale) * aspect.align.y;
  }
  return [sx, 0, 0, sy, tx - viewBox.x * sx, ty - viewBox.y * sy];
}
