import { toHex, type Color } from '../color';
import { show } from '../limits';
import type { GradientFill, GradientStop, Matrix } from '../writer';
import { readNumber } from './number';
import { computeStyle, diagonal, initialStyle, parseLength, type Viewport } from './presentation';
import type { Bounds } from './shapes';
import { IDENTITY, multiply, parseTransform } from './transform';
import type { XmlElement } from './xml';

export type GradientPaint =
  | { readonly kind: 'gradient'; readonly gradient: GradientFill }
  /** A gradient with one stop, or with no length or radius, paints one color. */
  | { readonly kind: 'solid'; readonly color: Color }
  /** Paints nothing: no stops, or a bounding box with no width or height. */
  | { readonly kind: 'none' };

const GRADIENTS = new Set(['linearGradient', 'radialGradient']);

/** The `href` (or SVG 1.1's `xlink:href`) of an element. */
export function hrefOf(element: XmlElement): string | undefined {
  return element.attributes.get('href') ?? element.attributes.get('xlink:href');
}

/** A gradient and the gradients it takes attributes and stops from through `href`, in order. */
function chainOf(
  gradient: XmlElement,
  ids: ReadonlyMap<string, XmlElement>,
  warn: (message: string) => void,
): XmlElement[] {
  const chain = [gradient];
  const seen = new Set(chain);
  for (let current = gradient; ;) {
    const href = hrefOf(current);
    if (href === undefined) break;
    if (!href.startsWith('#')) {
      warn(`ngpdf: pdf-svg skipped the external reference "${show(href)}"`);
      break;
    }
    const next = ids.get(href.slice(1));
    if (!next || !GRADIENTS.has(next.name) || seen.has(next)) break;
    chain.push(next);
    seen.add(next);
    current = next;
  }
  return chain;
}

/** A coordinate of the gradient: a fraction of the box, or a length in user space. */
function coordinate(
  text: string | undefined,
  fallback: number,
  boxUnits: boolean,
  reference: number,
): number {
  if (text === undefined) return fallback;
  if (boxUnits) {
    const trimmed = text.trim();
    const read = readNumber(trimmed, 0);
    if (!read) return fallback;
    const rest = trimmed.slice(read.end);
    if (rest === '%') return read.value / 100;
    return rest === '' ? read.value : fallback;
  }
  return parseLength(text, reference) ?? fallback;
}

/** pdfkit stretches the first and last stops to 0 and 1, so the ends are always there. */
function padStops(stops: GradientStop[]): GradientStop[] {
  const first = stops[0];
  const last = stops.at(-1);
  if (first && first.offset > 0) stops.unshift({ ...first, offset: 0 });
  if (last && last.offset < 1) stops.push({ ...last, offset: 1 });
  return stops;
}

/**
 * The paint of the gradient `gradient` on a shape with bounding box `bounds`, at `opacity` (the
 * fill or stroke opacity, folded into the stops). Attributes and stops missing on it come from
 * the gradients its `href` chain points at. Stop offsets are clamped to [0, 1] and never go back.
 * Only `spreadMethod="pad"` is drawn; another warns and is drawn as pad.
 */
export function gradientPaint(
  gradient: XmlElement,
  ids: ReadonlyMap<string, XmlElement>,
  bounds: Bounds,
  viewport: Viewport,
  color: Color,
  opacity: number,
  warn: (message: string) => void,
): GradientPaint {
  const chain = chainOf(gradient, ids, warn);
  const attribute = (name: string): string | undefined => {
    for (const element of chain) {
      const value = element.attributes.get(name);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  const spread = attribute('spreadMethod')?.trim();
  if (spread !== undefined && spread !== 'pad') {
    warn(`ngpdf: pdf-svg does not support spreadMethod="${show(spread)}"; drawn as pad`);
  }
  const owner = chain.find((element) => element.children.some((child) => child.name === 'stop'));
  const base = initialStyle(color);
  let previous = 0;
  const stops: GradientStop[] = [];
  let lastColor: Color | null = null;
  for (const stop of owner?.children ?? []) {
    if (stop.name !== 'stop') continue;
    const style = computeStyle(stop, base, viewport, warn);
    const offset = Math.min(
      1,
      Math.max(previous, coordinate(stop.attributes.get('offset'), 0, true, 1)),
    );
    previous = offset;
    const stopColor = style.stopColor === 'current' ? style.color : style.stopColor;
    lastColor = { ...stopColor, a: stopColor.a * style.stopOpacity * opacity };
    stops.push({ offset, color: toHex(lastColor), opacity: lastColor.a });
  }
  if (!lastColor) return { kind: 'none' };
  const only = lastColor;
  const solid = (): GradientPaint => ({ kind: 'solid', color: only });
  if (stops.length === 1) return solid();

  const boxUnits = attribute('gradientUnits')?.trim() !== 'userSpaceOnUse';
  if (boxUnits && !(bounds.w > 0 && bounds.h > 0)) return { kind: 'none' };
  const transformText = attribute('gradientTransform');
  let transform = transformText === undefined ? IDENTITY : parseTransform(transformText);
  if (transform === null) {
    warn(
      `ngpdf: pdf-svg ignored the invalid value "${show(transformText ?? '')}" for gradientTransform`,
    );
    transform = IDENTITY;
  }
  const matrix: Matrix = boxUnits
    ? multiply([bounds.w, 0, 0, bounds.h, bounds.x, bounds.y], transform)
    : transform;
  const at = (name: string, fallback: number, reference: number): number =>
    coordinate(attribute(name), fallback, boxUnits, reference);
  const { width, height } = viewport;
  const full = (size: number): number => (boxUnits ? 1 : size);

  if (gradient.name === 'linearGradient') {
    const x1 = at('x1', 0, width);
    const y1 = at('y1', 0, height);
    const x2 = at('x2', full(width), width);
    const y2 = at('y2', 0, height);
    if (x1 === x2 && y1 === y2) return solid();
    return {
      kind: 'gradient',
      gradient: { kind: 'linear', x1, y1, x2, y2, stops: padStops(stops), matrix },
    };
  }
  const radius = diagonal(viewport);
  const cx = at('cx', full(width) / 2, width);
  const cy = at('cy', full(height) / 2, height);
  const r = at('r', full(radius) / 2, radius);
  const fx = at('fx', cx, width);
  const fy = at('fy', cy, height);
  const fr = Math.max(0, at('fr', 0, radius));
  if (!(r > 0)) return r === 0 ? solid() : { kind: 'none' };
  return {
    kind: 'gradient',
    gradient: {
      kind: 'radial',
      cx,
      cy,
      r1: Math.min(fr, r),
      r2: r,
      scaleY: 1,
      ...(fx !== cx && { fx }),
      ...(fy !== cy && { fy }),
      stops: padStops(stops),
      matrix,
    },
  };
}
