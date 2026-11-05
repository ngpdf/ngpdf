import type {
  PdfCanvasFillRule,
  PdfCanvasLineCap,
  PdfCanvasLineJoin,
} from '../../tree/canvas-context';
import { parseColor, type Color } from '../color';
import { show } from '../limits';
import { parseNumberList, readNumber } from './number';
import type { XmlElement } from './xml';

/** What a fill or a stroke paints with. */
export type Paint =
  | { readonly kind: 'none' }
  | { readonly kind: 'color'; readonly color: Color }
  /** The element's own `color`, resolved where it is painted. */
  | { readonly kind: 'current' }
  /** A gradient in the same file, and what to paint when it is not one. */
  | { readonly kind: 'url'; readonly id: string; readonly fallback: Paint | null };

/** The size percentages are taken of: the nearest viewBox, or viewport without one. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface SvgStyle {
  // Inherited.
  readonly color: Color;
  readonly fill: Paint;
  readonly fillOpacity: number;
  readonly fillRule: PdfCanvasFillRule;
  readonly stroke: Paint;
  readonly strokeOpacity: number;
  readonly strokeWidth: number;
  readonly lineCap: PdfCanvasLineCap;
  readonly lineJoin: PdfCanvasLineJoin;
  readonly miterLimit: number;
  /** Null when solid. */
  readonly dashArray: readonly number[] | null;
  readonly dashOffset: number;
  /** `visibility`: a hidden element paints nothing, but its children may be visible again. */
  readonly visible: boolean;
  // Not inherited.
  readonly opacity: number;
  readonly display: boolean;
  /** The transform list as written, from the attribute or a `style`. */
  readonly transform: string | null;
  readonly stopColor: Color | 'current';
  readonly stopOpacity: number;
}

const BLACK: Color = { r: 0, g: 0, b: 0, a: 1 };

/** The style of the root's parent: SVG's initial values, with the `pdf-svg`'s color. */
export function initialStyle(color: Color): SvgStyle {
  return {
    color,
    fill: { kind: 'color', color: BLACK },
    fillOpacity: 1,
    fillRule: 'nonzero',
    stroke: { kind: 'none' },
    strokeOpacity: 1,
    strokeWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 4,
    dashArray: null,
    dashOffset: 0,
    visible: true,
    opacity: 1,
    display: true,
    transform: null,
    stopColor: BLACK,
    stopOpacity: 1,
  };
}

/** The properties that apply to an element only, reset on each child. */
const NOT_INHERITED = {
  opacity: 1,
  display: true,
  transform: null,
  stopColor: BLACK,
  stopOpacity: 1,
} as const satisfies Partial<SvgStyle>;

// Units as ngpdf reads them everywhere: px is 1pt.
const UNITS = new Map([
  ['', 1],
  ['px', 1],
  ['pt', 1],
  ['pc', 12],
  ['in', 72],
  ['cm', 72 / 2.54],
  ['mm', 72 / 25.4],
]);

/** A length in user units; `%` is of `reference`. Null for anything else, `em` included. */
export function parseLength(text: string, reference: number): number | null {
  const trimmed = text.trim();
  const read = readNumber(trimmed, 0);
  if (!read) return null;
  const unit = trimmed.slice(read.end).toLowerCase();
  if (unit === '%') return (read.value / 100) * reference;
  const factor = UNITS.get(unit);
  return factor === undefined ? null : read.value * factor;
}

/** The reference of a percentage that is neither horizontal nor vertical, such as a stroke width. */
export function diagonal(viewport: Viewport): number {
  return Math.sqrt((viewport.width ** 2 + viewport.height ** 2) / 2);
}

function parseOpacity(text: string): number | null {
  const trimmed = text.trim();
  const read = readNumber(trimmed, 0);
  if (!read) return null;
  const rest = trimmed.slice(read.end);
  if (rest !== '' && rest !== '%') return null;
  const value = rest === '%' ? read.value / 100 : read.value;
  return Math.min(1, Math.max(0, value));
}

function parseSolid(text: string): Color | 'current' | null {
  if (text.toLowerCase() === 'currentcolor') return 'current';
  try {
    return parseColor(text);
  } catch {
    return null;
  }
}

/** A paint, or null when invalid. An external `url()` is skipped, with its fallback if any. */
function parsePaint(text: string, warn: (message: string) => void): Paint | null {
  const trimmed = text.trim();
  if (trimmed === 'none') return { kind: 'none' };
  if (!trimmed.toLowerCase().startsWith('url(')) {
    const solid = parseSolid(trimmed);
    if (solid === null) return null;
    return solid === 'current' ? { kind: 'current' } : { kind: 'color', color: solid };
  }
  const close = trimmed.indexOf(')');
  if (close < 0) return null;
  const reference = trimmed
    .slice(4, close)
    .trim()
    .replace(/^(["'])(.*)\1$/, '$2');
  const rest = trimmed.slice(close + 1).trim();
  let fallback: Paint | null = null;
  if (rest !== '') {
    fallback = parsePaint(rest, warn);
    if (fallback === null || fallback.kind === 'url') return null;
  }
  if (!reference.startsWith('#')) {
    warn(`ngpdf: pdf-svg skipped the external reference "${show(reference)}"`);
    return fallback ?? { kind: 'none' };
  }
  return { kind: 'url', id: reference.slice(1), fallback };
}

function keyword<T extends string>(text: string, allowed: readonly T[]): T | null {
  const trimmed = text.trim() as T;
  return allowed.includes(trimmed) ? trimmed : null;
}

function parseDashArray(text: string, reference: number): readonly number[] | null | undefined {
  if (text.trim() === 'none') return null;
  const parts = text
    .trim()
    .split(/[\s,]+/)
    .map((part) => parseLength(part, reference));
  if (parts.some((part) => part === null || part < 0)) return undefined;
  const lengths = parts as number[];
  // All zeros draws a solid line, as does an empty list.
  if (lengths.every((length) => length === 0)) return null;
  return lengths.length % 2 === 1 ? [...lengths, ...lengths] : lengths;
}

/** The `style` attribute's declarations, by property, `!important` dropped. Comments are skipped. */
function declarations(style: string): Map<string, string> {
  const out = new Map<string, string>();
  let text = '';
  let at = 0;
  for (;;) {
    const open = style.indexOf('/*', at);
    if (open < 0) {
      text += style.slice(at);
      break;
    }
    text += style.slice(at, open);
    const close = style.indexOf('*/', open + 2);
    if (close < 0) break;
    at = close + 2;
  }
  for (const declaration of text.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration
      .slice(colon + 1)
      .replace(/!\s*important\s*$/i, '')
      .trim();
    if (name !== '' && value !== '') out.set(name, value);
  }
  return out;
}

/** Features ngpdf does not draw, named by the attribute or property that asks for them. */
const UNSUPPORTED = new Set([
  'clip-path',
  'mask',
  'filter',
  'marker',
  'marker-start',
  'marker-mid',
  'marker-end',
]);

const CAPS: readonly PdfCanvasLineCap[] = ['butt', 'round', 'square'];
const JOINS: readonly PdfCanvasLineJoin[] = ['miter', 'round', 'bevel'];
const RULES: readonly PdfCanvasFillRule[] = ['nonzero', 'evenodd'];

/**
 * The style of `element`: its presentation attributes, then the declarations of its `style`
 * attribute over them, on top of what it inherits from `parent`. `inherit` takes the parent's
 * value. An invalid value is ignored with a warning, as SVG ignores it.
 */
export function computeStyle(
  element: XmlElement,
  parent: SvgStyle,
  viewport: Viewport,
  warn: (message: string) => void,
): SvgStyle {
  const style: { -readonly [K in keyof SvgStyle]: SvgStyle[K] } = {
    ...parent,
    ...NOT_INHERITED,
  };
  const ignore = (name: string, value: string): void => {
    warn(`ngpdf: pdf-svg ignored the invalid value "${show(value)}" for ${name}`);
  };
  const set = (name: string, value: string): void => {
    const trimmed = value.trim();
    if (UNSUPPORTED.has(name)) {
      if (trimmed !== 'none') warn(`ngpdf: pdf-svg does not support ${name}`);
      return;
    }
    const inherit = trimmed === 'inherit';
    const take = <K extends keyof SvgStyle>(key: K, parsed: SvgStyle[K] | null | undefined) => {
      if (inherit) style[key] = parent[key];
      else if (parsed === null || parsed === undefined) ignore(name, value);
      else style[key] = parsed;
    };
    switch (name) {
      case 'color': {
        const solid = inherit ? parent.color : parseSolid(trimmed);
        take('color', solid === 'current' ? parent.color : solid);
        return;
      }
      case 'fill':
        take('fill', inherit ? null : parsePaint(trimmed, warn));
        return;
      case 'stroke':
        take('stroke', inherit ? null : parsePaint(trimmed, warn));
        return;
      case 'fill-opacity':
        take('fillOpacity', parseOpacity(trimmed));
        return;
      case 'stroke-opacity':
        take('strokeOpacity', parseOpacity(trimmed));
        return;
      case 'opacity':
        take('opacity', parseOpacity(trimmed));
        return;
      case 'stop-opacity':
        take('stopOpacity', parseOpacity(trimmed));
        return;
      case 'stop-color':
        take('stopColor', parseSolid(trimmed));
        return;
      case 'fill-rule':
        take('fillRule', keyword(trimmed, RULES));
        return;
      case 'stroke-linecap':
        take('lineCap', keyword(trimmed, CAPS));
        return;
      case 'stroke-linejoin':
        take('lineJoin', keyword(trimmed, JOINS));
        return;
      case 'stroke-width': {
        const width = parseLength(trimmed, diagonal(viewport));
        take('strokeWidth', width !== null && width >= 0 ? width : null);
        return;
      }
      case 'stroke-miterlimit': {
        const limit = parseNumberList(trimmed);
        take('miterLimit', limit?.length === 1 && (limit[0] ?? 0) >= 1 ? limit[0] : null);
        return;
      }
      case 'stroke-dasharray':
        take('dashArray', parseDashArray(trimmed, diagonal(viewport)));
        return;
      case 'stroke-dashoffset':
        take('dashOffset', parseLength(trimmed, diagonal(viewport)));
        return;
      case 'visibility': {
        const visible = trimmed === 'visible' ? true : null;
        take('visible', trimmed === 'hidden' || trimmed === 'collapse' ? false : visible);
        return;
      }
      case 'display':
        style.display = trimmed !== 'none';
        return;
      case 'transform':
        style.transform = trimmed;
        return;
      default:
        // Other properties (font-size, …) do not change what ngpdf draws.
        return;
    }
  };
  for (const [name, value] of element.attributes) {
    if (name !== 'style' && name !== 'transform') set(name, value);
  }
  const transform = element.attributes.get('transform');
  if (transform !== undefined) set('transform', transform);
  const inline = element.attributes.get('style');
  if (inline !== undefined) {
    for (const [name, value] of declarations(inline)) set(name, value);
  }
  return style;
}
