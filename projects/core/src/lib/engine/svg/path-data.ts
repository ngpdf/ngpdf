import type { PathSegment, Point } from '../writer';
import { readNumber, skipSeparator, skipSpaces } from './number';

export interface ParsedPath {
  /** In the path's own coordinates; a subpath starts with a `move`. */
  readonly segments: readonly PathSegment[];
  /** Where the first error is: the path is drawn up to it, as SVG says. */
  readonly error?: number;
}

/** How many numbers each command takes; a flag of an arc counts as one. */
const ARITY = new Map([
  ['m', 2],
  ['l', 2],
  ['h', 1],
  ['v', 1],
  ['c', 6],
  ['s', 4],
  ['q', 4],
  ['t', 2],
  ['a', 7],
  ['z', 0],
]);

/** Points of a unit circle arc of at most 90° as one cubic curve: the tangent length factor. */
function arcCurves(
  center: Point,
  rx: number,
  ry: number,
  phi: number,
  start: number,
  sweep: number,
  to: Point,
): PathSegment[] {
  const pieces = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
  const step = sweep / pieces;
  const k = (4 / 3) * Math.tan(step / 4);
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const at = (angle: number, dx: number, dy: number): Point => {
    // A point of the unrotated ellipse, moved by (dx, dy) of the unit tangent, then rotated.
    const x = rx * (Math.cos(angle) + dx);
    const y = ry * (Math.sin(angle) + dy);
    return { x: center.x + cos * x - sin * y, y: center.y + sin * x + cos * y };
  };
  const segments: PathSegment[] = [];
  for (let i = 0; i < pieces; i++) {
    const a1 = start + i * step;
    const a2 = a1 + step;
    const last = i === pieces - 1;
    segments.push({
      kind: 'curve',
      c1: at(a1, -k * Math.sin(a1), k * Math.cos(a1)),
      c2: at(a2, k * Math.sin(a2), -k * Math.cos(a2)),
      // The end point exactly as written, not as the trigonometry rounds it.
      to: last ? to : at(a2, 0, 0),
    });
  }
  return segments;
}

/** The angle from vector u to vector v, signed. */
function angleBetween(ux: number, uy: number, vx: number, vy: number): number {
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

/**
 * An elliptical arc as cubic curves of at most 90° each, by the endpoint to center conversion of
 * SVG's implementation notes. A zero radius draws a line; an arc to its own start draws nothing.
 * Radii too small to reach the end point are scaled up until they do.
 */
export function arcToCurves(
  from: Point,
  radiusX: number,
  radiusY: number,
  rotation: number,
  large: boolean,
  sweep: boolean,
  to: Point,
): PathSegment[] {
  if (from.x === to.x && from.y === to.y) return [];
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  if (rx === 0 || ry === 0) return [{ kind: 'line', to }];
  const phi = ((rotation % 360) * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const root = Math.sqrt(Math.max(0, numerator / denominator)) * (large === sweep ? -1 : 1);
  const cx1 = (root * rx * y1) / ry;
  const cy1 = (-root * ry * x1) / rx;
  const center = {
    x: cos * cx1 - sin * cy1 + (from.x + to.x) / 2,
    y: sin * cx1 + cos * cy1 + (from.y + to.y) / 2,
  };
  const ux = (x1 - cx1) / rx;
  const uy = (y1 - cy1) / ry;
  const vx = (-x1 - cx1) / rx;
  const vy = (-y1 - cy1) / ry;
  const start = angleBetween(1, 0, ux, uy);
  let extent = angleBetween(ux, uy, vx, vy);
  if (!sweep && extent > 0) extent -= 2 * Math.PI;
  else if (sweep && extent < 0) extent += 2 * Math.PI;
  return arcCurves(center, rx, ry, phi, start, extent, to);
}

const cubicFromQuadratic = (from: Point, control: Point, to: Point): PathSegment => ({
  kind: 'curve',
  c1: { x: from.x + (2 / 3) * (control.x - from.x), y: from.y + (2 / 3) * (control.y - from.y) },
  c2: { x: to.x + (2 / 3) * (control.x - to.x), y: to.y + (2 / 3) * (control.y - to.y) },
  to,
});

const reflect = (point: Point, about: Point): Point => ({
  x: 2 * about.x - point.x,
  y: 2 * about.y - point.y,
});

/**
 * Parses SVG path data (`d`), every command, absolute and relative, in one pass. Quadratic curves
 * and arcs become cubic curves, so a path is only moves, lines, cubic curves and closes. At the
 * first error the path stops, keeping what came before, as SVG renderers do.
 */
export function parsePathData(d: string): ParsedPath {
  const segments: PathSegment[] = [];
  let current: Point = { x: 0, y: 0 };
  let start: Point = current;
  // The last control point of a cubic or quadratic curve, for S and T to reflect.
  let cubicControl: Point | null = null;
  let quadControl: Point | null = null;
  let closed = false;
  let at = skipSpaces(d, 0);
  let command = '';
  let first = true;

  const stop = (error: number): ParsedPath => ({ segments, error });

  while (at < d.length) {
    const commandAt = at;
    const char = d[at] ?? '';
    if (ARITY.has(char.toLowerCase())) {
      command = char;
      at = skipSpaces(d, at + 1);
    } else if (command === '' || command === 'z' || command === 'Z') {
      return stop(at);
    }
    if (first && command.toLowerCase() !== 'm') return stop(commandAt);
    first = false;
    const kind = command.toLowerCase();
    const relative = command !== command.toUpperCase();
    const count = ARITY.get(kind) ?? 0;
    const args: number[] = [];
    for (let i = 0; i < count; i++) {
      if (i > 0) at = skipSeparator(d, at);
      if (kind === 'a' && (i === 3 || i === 4)) {
        const flag = d.charCodeAt(at);
        if (flag !== 0x30 && flag !== 0x31) return stop(at);
        args.push(flag - 0x30);
        at++;
        continue;
      }
      const read = readNumber(d, at);
      if (!read) return stop(at);
      args.push(read.value);
      at = read.end;
    }
    const base = relative ? current : { x: 0, y: 0 };
    const point = (i: number): Point => ({
      x: base.x + (args[i] ?? 0),
      y: base.y + (args[i + 1] ?? 0),
    });
    // After a close, any command but a move starts again at the subpath's start.
    if (closed && kind !== 'm' && kind !== 'z') segments.push({ kind: 'move', to: current });
    closed = false;
    let nextCubic: Point | null = null;
    let nextQuad: Point | null = null;
    switch (kind) {
      case 'm': {
        current = point(0);
        start = current;
        segments.push({ kind: 'move', to: current });
        // Further pairs after a move are lines of the same kind.
        command = relative ? 'l' : 'L';
        break;
      }
      case 'l':
        current = point(0);
        segments.push({ kind: 'line', to: current });
        break;
      case 'h':
        current = { x: (relative ? current.x : 0) + (args[0] ?? 0), y: current.y };
        segments.push({ kind: 'line', to: current });
        break;
      case 'v':
        current = { x: current.x, y: (relative ? current.y : 0) + (args[0] ?? 0) };
        segments.push({ kind: 'line', to: current });
        break;
      case 'c': {
        const c2 = point(2);
        const to = point(4);
        segments.push({ kind: 'curve', c1: point(0), c2, to });
        current = to;
        nextCubic = c2;
        break;
      }
      case 's': {
        const c1: Point = cubicControl ? reflect(cubicControl, current) : current;
        const c2 = point(0);
        const to = point(2);
        segments.push({ kind: 'curve', c1, c2, to });
        current = to;
        nextCubic = c2;
        break;
      }
      case 'q': {
        const control = point(0);
        const to = point(2);
        segments.push(cubicFromQuadratic(current, control, to));
        current = to;
        nextQuad = control;
        break;
      }
      case 't': {
        const control: Point = quadControl ? reflect(quadControl, current) : current;
        const to = point(0);
        segments.push(cubicFromQuadratic(current, control, to));
        current = to;
        nextQuad = control;
        break;
      }
      case 'a': {
        const [rx = 0, ry = 0, rotation = 0, large = 0, sweep = 0] = args;
        const to = point(5);
        segments.push(...arcToCurves(current, rx, ry, rotation, large === 1, sweep === 1, to));
        current = to;
        break;
      }
      default:
        // 'z'
        segments.push({ kind: 'close' });
        current = start;
        closed = true;
        break;
    }
    cubicControl = nextCubic;
    quadControl = nextQuad;
    at = skipSeparator(d, at);
  }
  return { segments };
}
