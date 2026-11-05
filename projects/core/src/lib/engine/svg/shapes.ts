import type { PathSegment, Point } from '../writer';
import { parseNumberList } from './number';
import { parsePathData } from './path-data';
import { diagonal, parseLength, type Viewport } from './presentation';
import type { XmlElement } from './xml';

// Control point distance of a quarter ellipse drawn as one cubic curve, per unit of radius.
const KAPPA = 0.5522847498;

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * A length attribute. Missing, it is `fallback`; one that does not parse is null, which draws
 * nothing, as an SVG error does.
 */
function lengthOf(
  element: XmlElement,
  name: string,
  reference: number,
  fallback: number | null,
): number | null {
  const value = element.attributes.get(name);
  if (value === undefined || value.trim() === 'auto') return fallback;
  return parseLength(value, reference);
}

const move = (x: number, y: number): PathSegment => ({ kind: 'move', to: { x, y } });
const line = (x: number, y: number): PathSegment => ({ kind: 'line', to: { x, y } });
const curve = (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) =>
  ({ kind: 'curve', c1: { x: c1x, y: c1y }, c2: { x: c2x, y: c2y }, to: { x, y } }) as const;
const CLOSE: PathSegment = { kind: 'close' };

function ellipse(cx: number, cy: number, rx: number, ry: number): PathSegment[] {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  return [
    move(cx + rx, cy),
    curve(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry),
    curve(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy),
    curve(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry),
    curve(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy),
    CLOSE,
  ];
}

function rect(element: XmlElement, viewport: Viewport): PathSegment[] | null {
  const x = lengthOf(element, 'x', viewport.width, 0);
  const y = lengthOf(element, 'y', viewport.height, 0);
  const w = lengthOf(element, 'width', viewport.width, 0);
  const h = lengthOf(element, 'height', viewport.height, 0);
  if (x === null || y === null || w === null || h === null || !(w > 0 && h > 0)) return null;
  let rx = lengthOf(element, 'rx', viewport.width, null);
  let ry = lengthOf(element, 'ry', viewport.height, null);
  // A missing or negative radius takes the other one.
  if (rx === null || rx < 0) rx = ry !== null && ry >= 0 ? ry : 0;
  if (ry === null || ry < 0) ry = rx;
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  if (rx === 0 || ry === 0) {
    return [move(x, y), line(x + w, y), line(x + w, y + h), line(x, y + h), CLOSE];
  }
  const kx = rx * (1 - KAPPA);
  const ky = ry * (1 - KAPPA);
  const [right, bottom] = [x + w, y + h];
  return [
    move(x + rx, y),
    line(right - rx, y),
    curve(right - kx, y, right, y + ky, right, y + ry),
    line(right, bottom - ry),
    curve(right, bottom - ky, right - kx, bottom, right - rx, bottom),
    line(x + rx, bottom),
    curve(x + kx, bottom, x, bottom - ky, x, bottom - ry),
    line(x, y + ry),
    curve(x, y + ky, x + kx, y, x + rx, y),
    CLOSE,
  ];
}

function points(element: XmlElement, closed: boolean): PathSegment[] | null {
  const numbers = parseNumberList(element.attributes.get('points') ?? '');
  if (!numbers || numbers.length < 4) return null;
  const segments: PathSegment[] = [];
  // An odd count leaves the last number out, as SVG draws up to the error.
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    const [x = 0, y = 0] = [numbers[i], numbers[i + 1]];
    segments.push(i === 0 ? move(x, y) : line(x, y));
  }
  if (closed) segments.push(CLOSE);
  return segments;
}

/**
 * The outline of a basic shape or a path, in its own user space. Null when it draws nothing: no
 * area, a radius of 0, a bad length, too few points, or path data with no line or curve.
 */
export function shapeSegments(
  element: XmlElement,
  viewport: Viewport,
): readonly PathSegment[] | null {
  switch (element.name) {
    case 'rect':
      return rect(element, viewport);
    case 'circle': {
      const cx = lengthOf(element, 'cx', viewport.width, 0);
      const cy = lengthOf(element, 'cy', viewport.height, 0);
      const r = lengthOf(element, 'r', diagonal(viewport), 0);
      if (cx === null || cy === null || r === null || !(r > 0)) return null;
      return ellipse(cx, cy, r, r);
    }
    case 'ellipse': {
      const cx = lengthOf(element, 'cx', viewport.width, 0);
      const cy = lengthOf(element, 'cy', viewport.height, 0);
      const rx = lengthOf(element, 'rx', viewport.width, null);
      const ry = lengthOf(element, 'ry', viewport.height, null);
      // SVG 2: an auto radius takes the other one.
      const [x, y] = [rx ?? ry, ry ?? rx];
      if (cx === null || cy === null || x === null || y === null || !(x > 0 && y > 0)) return null;
      return ellipse(cx, cy, x, y);
    }
    case 'line': {
      const x1 = lengthOf(element, 'x1', viewport.width, 0);
      const y1 = lengthOf(element, 'y1', viewport.height, 0);
      const x2 = lengthOf(element, 'x2', viewport.width, 0);
      const y2 = lengthOf(element, 'y2', viewport.height, 0);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      return [move(x1, y1), line(x2, y2)];
    }
    case 'polyline':
      return points(element, false);
    case 'polygon':
      return points(element, true);
    case 'path': {
      const { segments } = parsePathData(element.attributes.get('d') ?? '');
      return segments.some((segment) => segment.kind === 'line' || segment.kind === 'curve')
        ? segments
        : null;
    }
    default:
      return null;
  }
}

/** Where a cubic's coordinate has a turning point, as parameters in (0, 1). */
function extremes(p0: number, p1: number, p2: number, p3: number): number[] {
  // The derivative, divided by 3: a t² + b t + c.
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      roots.push((-b + root) / (2 * a), (-b - root) / (2 * a));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** The tight bounding box of a path: curves count by their extremes, not their control points. */
export function boundsOf(segments: readonly PathSegment[]): Bounds {
  const xs: number[] = [];
  const ys: number[] = [];
  let current: Point = { x: 0, y: 0 };
  for (const segment of segments) {
    if (segment.kind === 'close') continue;
    if (segment.kind === 'curve') {
      const { c1, c2, to } = segment;
      for (const t of extremes(current.x, c1.x, c2.x, to.x)) {
        xs.push(cubicAt(current.x, c1.x, c2.x, to.x, t));
      }
      for (const t of extremes(current.y, c1.y, c2.y, to.y)) {
        ys.push(cubicAt(current.y, c1.y, c2.y, to.y, t));
      }
    }
    xs.push(segment.to.x);
    ys.push(segment.to.y);
    current = segment.to;
  }
  if (xs.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  // Not Math.min(...xs): a long path would pass too many arguments.
  const [minX, maxX] = xs.reduce(
    ([lo, hi], x) => [Math.min(lo, x), Math.max(hi, x)],
    [Infinity, -Infinity],
  );
  const [minY, maxY] = ys.reduce(
    ([lo, hi], y) => [Math.min(lo, y), Math.max(hi, y)],
    [Infinity, -Infinity],
  );
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
