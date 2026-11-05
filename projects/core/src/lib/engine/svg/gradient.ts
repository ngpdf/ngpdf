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

/** How many gradients one may take attributes and stops from through `href`, itself included. */
export const MAX_GRADIENT_CHAIN = 16;

/** What a gradient element resolves to once per compile, before any shape paints with it. */
export interface ResolvedGradient {
  readonly element: XmlElement;
  /** An attribute of the gradient, or of the first gradient its `href` chain has it on. */
  readonly attribute: (name: string) => string | undefined;
  /** Offsets clamped and in order. */
  readonly stops: readonly GradientColorStop[];
  readonly transform: Matrix;
}

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
    if (chain.length >= MAX_GRADIENT_CHAIN) {
      warn(
        `ngpdf: pdf-svg gradient href chain longer than ${String(MAX_GRADIENT_CHAIN)}; the rest is ignored`,
      );
      break;
    }
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

// Stops and their colors take no percentages, so any viewport resolves them.
const NO_VIEWPORT: Viewport = { width: 0, height: 0 };

export interface GradientColorStop {
  readonly offset: number;
  /** Its alpha has the stop's opacity in it. */
  readonly color: Color;
}

/** The stops of `owner`, offsets clamped to [0, 1] and never going back. */
function stopsOf(
  owner: XmlElement,
  color: Color,
  warn: (message: string) => void,
): GradientColorStop[] {
  const base = initialStyle(color);
  let previous = 0;
  const stops: GradientColorStop[] = [];
  for (const stop of owner.children) {
    if (stop.name !== 'stop') continue;
    const style = computeStyle(stop, base, NO_VIEWPORT, warn);
    const offset = Math.min(
      1,
      Math.max(previous, coordinate(stop.attributes.get('offset'), 0, true, 1)),
    );
    previous = offset;
    const stopColor = style.stopColor === 'current' ? style.color : style.stopColor;
    stops.push({ offset, color: { ...stopColor, a: stopColor.a * style.stopOpacity } });
  }
  return stops;
}

/**
 * Resolves `gradient` once: its `href` chain (at most 16 gradients), its stops and its
 * `gradientTransform`. Stop offsets are clamped to [0, 1] and never go back; `currentColor` in a
 * stop is `color`. Only `spreadMethod="pad"` is drawn; another warns and is drawn as pad.
 */
export function resolveGradient(
  gradient: XmlElement,
  ids: ReadonlyMap<string, XmlElement>,
  color: Color,
  warn: (message: string) => void,
  /** Stops by the gradient that holds them, shared by every gradient that points at it. */
  stopsCache: Map<XmlElement, readonly GradientColorStop[]> = new Map(),
): ResolvedGradient {
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
  let stops: readonly GradientColorStop[] = [];
  if (owner) {
    const cached = stopsCache.get(owner);
    stops = cached ?? stopsOf(owner, color, warn);
    if (!cached) stopsCache.set(owner, stops);
  }
  const transformText = attribute('gradientTransform');
  let transform = transformText === undefined ? IDENTITY : parseTransform(transformText);
  if (transform === null) {
    warn(
      `ngpdf: pdf-svg ignored the invalid value "${show(transformText ?? '')}" for gradientTransform`,
    );
    transform = IDENTITY;
  }
  return { element: gradient, attribute, stops, transform };
}

/**
 * The paint of a resolved gradient on a shape with bounding box `bounds`, at `opacity` (the fill
 * or stroke opacity, folded into the stops).
 */
export function gradientPaint(
  resolved: ResolvedGradient,
  bounds: Bounds,
  viewport: Viewport,
  opacity: number,
): GradientPaint {
  const { attribute, transform } = resolved;
  // Built only for a gradient it returns: the caller counts those stops, and one color costs nothing.
  const stopsOf = (): GradientStop[] =>
    padStops(
      resolved.stops.map((stop) => ({
        offset: stop.offset,
        color: toHex(stop.color),
        opacity: stop.color.a * opacity,
      })),
    );
  const last = resolved.stops.at(-1);
  if (!last) return { kind: 'none' };
  const only: Color = { ...last.color, a: last.color.a * opacity };
  const solid = (): GradientPaint => ({ kind: 'solid', color: only });
  if (resolved.stops.length === 1) return solid();

  const boxUnits = attribute('gradientUnits')?.trim() !== 'userSpaceOnUse';
  if (boxUnits && !(bounds.w > 0 && bounds.h > 0)) return { kind: 'none' };
  const matrix: Matrix = boxUnits
    ? multiply([bounds.w, 0, 0, bounds.h, bounds.x, bounds.y], transform)
    : transform;
  const at = (name: string, fallback: number, reference: number): number =>
    coordinate(attribute(name), fallback, boxUnits, reference);
  const { width, height } = viewport;
  const full = (size: number): number => (boxUnits ? 1 : size);

  if (resolved.element.name === 'linearGradient') {
    const x1 = at('x1', 0, width);
    const y1 = at('y1', 0, height);
    const x2 = at('x2', full(width), width);
    const y2 = at('y2', 0, height);
    if (x1 === x2 && y1 === y2) return solid();
    return {
      kind: 'gradient',
      gradient: { kind: 'linear', x1, y1, x2, y2, stops: stopsOf(), matrix },
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
      stops: stopsOf(),
      matrix,
    },
  };
}
