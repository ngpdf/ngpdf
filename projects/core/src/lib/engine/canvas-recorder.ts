import type {
  PdfCanvasContext,
  PdfCanvasFillRule,
  PdfCanvasLineCap,
  PdfCanvasLineJoin,
  PdfCanvasSize,
} from '../tree/canvas-context';
import { parseColor, toHex, type Color } from './color';
import type { DrawOp, Matrix, PathSegment, Point } from './writer';

export type ShapeOp = Extract<DrawOp, { op: 'shape' }>;

/** Calls one canvas may make; a polygon point and a dash length count as one each. */
export const MAX_CANVAS_CALLS = 100_000;

const CAPS: readonly string[] = ['butt', 'round', 'square'] satisfies PdfCanvasLineCap[];
const JOINS: readonly string[] = ['miter', 'round', 'bevel'] satisfies PdfCanvasLineJoin[];
const RULES: readonly string[] = ['nonzero', 'evenodd'] satisfies PdfCanvasFillRule[];

// Control point distance of a quarter circle drawn as one cubic curve, per unit of radius.
const KAPPA = 0.5522847498;

const BLACK: Color = { r: 0, g: 0, b: 0, a: 1 };

interface State {
  readonly matrix: Matrix;
  readonly fill: Color;
  readonly stroke: Color;
  readonly lineWidth: number;
  readonly cap: PdfCanvasLineCap;
  readonly join: PdfCanvasLineJoin;
  readonly dash: { readonly pattern: readonly number[]; readonly phase: number } | null;
  readonly opacity: number;
}

const INITIAL: State = {
  matrix: [1, 0, 0, 1, 0, 0],
  fill: BLACK,
  stroke: BLACK,
  lineWidth: 1,
  cap: 'butt',
  join: 'miter',
  dash: null,
  opacity: 1,
};

/** `m · n`: n is applied first. */
function multiply(m: Matrix, n: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a * a2 + c * b2,
    b * a2 + d * b2,
    a * c2 + c * d2,
    b * c2 + d * d2,
    a * e2 + c * f2 + e,
    b * e2 + d * f2 + f,
  ];
}

/** A bad option value as an error message shows it: itself for a string, else its type. */
function shown(value: unknown): string {
  return typeof value === 'string' ? value : typeof value;
}

function fail(message: string): never {
  throw new Error(`ngpdf: pdf-canvas ${message}`);
}

/**
 * Runs `paint` once against a context that records what it draws, and returns the shapes in
 * points from the top left of the content box, with the canvas transform already applied.
 *
 * Painting uses up the path. A line or curve with no current point starts a subpath at its first
 * point. A quadratic curve becomes the equal cubic one, so every curve is drawn with `c`. Line
 * widths and dashes are scaled by the square root of the transform's area factor, exact for
 * uniform scales.
 */
export function recordCanvas(paint: unknown, size: PdfCanvasSize): readonly ShapeOp[] {
  if (typeof paint !== 'function') fail('paint is not a function');
  const shapes: ShapeOp[] = [];
  const saved: State[] = [];
  let state = INITIAL;
  let path: PathSegment[] = [];
  let start: Point | null = null;
  let current: Point | null = null;
  let calls = 0;
  let open = true;
  // The errors the context throws reach the caller as they are, not as paint failures.
  const own = new WeakSet<Error>();
  const check: (condition: boolean, message: string) => asserts condition = (
    condition,
    message,
  ) => {
    if (condition) return;
    const error = new Error(`ngpdf: pdf-canvas ${message}`);
    own.add(error);
    throw error;
  };

  const count = (method: string, numbers: readonly unknown[], extra = 0): void => {
    check(open, 'context used after paint returned');
    calls += 1 + extra;
    check(calls <= MAX_CANVAS_CALLS, `made more than ${String(MAX_CANVAS_CALLS)} calls`);
    for (const value of numbers) {
      check(
        typeof value === 'number' && Number.isFinite(value),
        `${method} got a non-finite number`,
      );
    }
  };
  const ink = (value: unknown): Color => {
    try {
      return parseColor(String(value), 'pdf-canvas');
    } catch (error) {
      if (error instanceof Error) own.add(error);
      throw error;
    }
  };
  const map = (x: number, y: number): Point => {
    const [a, b, c, d, e, f] = state.matrix;
    return { x: a * x + c * y + e, y: b * x + d * y + f };
  };
  const moveTo = (x: number, y: number): void => {
    const to = map(x, y);
    path.push({ kind: 'move', to });
    start = to;
    current = to;
  };
  const lineTo = (x: number, y: number): void => {
    if (!current) moveTo(x, y);
    const to = map(x, y);
    path.push({ kind: 'line', to });
    current = to;
  };
  const curveTo = (c1: Point, c2: Point, to: Point): void => {
    path.push({ kind: 'curve', c1, c2, to });
    current = to;
  };
  const closePath = (): void => {
    if (!current) return;
    path.push({ kind: 'close' });
    current = start;
  };
  /** An ellipse as four quarter curves, clockwise from its right end. */
  const ellipse = (cx: number, cy: number, rx: number, ry: number): void => {
    const ox = rx * KAPPA;
    const oy = ry * KAPPA;
    moveTo(cx + rx, cy);
    curveTo(map(cx + rx, cy + oy), map(cx + ox, cy + ry), map(cx, cy + ry));
    curveTo(map(cx - ox, cy + ry), map(cx - rx, cy + oy), map(cx - rx, cy));
    curveTo(map(cx - rx, cy - oy), map(cx - ox, cy - ry), map(cx, cy - ry));
    curveTo(map(cx + ox, cy - ry), map(cx + rx, cy - oy), map(cx + rx, cy));
    closePath();
  };
  const notNegative = (method: string, radius: number): void => {
    check(radius >= 0, `${method} must not have a negative radius`);
  };

  /** Records the path with the paints asked for, if any leaves ink, and starts a new path. */
  const paintPath = (fill: Color | null, stroke: Color | null, rule: PdfCanvasFillRule): void => {
    const segments = path;
    path = [];
    start = null;
    current = null;
    if (segments.length === 0) return;
    const fillOpacity = fill ? state.opacity * fill.a : 0;
    const strokeOpacity = stroke ? state.opacity * stroke.a : 0;
    const [a, b, c, d] = state.matrix;
    const scale = Math.sqrt(Math.abs(a * d - b * c));
    const width = state.lineWidth * scale;
    const { dash } = state;
    const shape: ShapeOp = {
      op: 'shape',
      segments,
      ...(fill && fillOpacity > 0 && { fill: { color: toHex(fill), opacity: fillOpacity, rule } }),
      ...(stroke &&
        strokeOpacity > 0 &&
        width > 0 && {
          stroke: {
            color: toHex(stroke),
            opacity: strokeOpacity,
            width,
            cap: state.cap,
            join: state.join,
            ...(dash && {
              dash: {
                pattern: dash.pattern.map((length) => length * scale),
                phase: dash.phase * scale,
              },
            }),
          },
        }),
    };
    if (shape.fill || shape.stroke) shapes.push(shape);
  };
  const ruleOf = (rule: unknown): PdfCanvasFillRule => {
    if (rule === undefined) return 'nonzero';
    check(typeof rule === 'string' && RULES.includes(rule), `unknown fill rule "${shown(rule)}"`);
    return rule as PdfCanvasFillRule;
  };

  const ctx: PdfCanvasContext = {
    moveTo(x, y) {
      count('moveTo', [x, y]);
      moveTo(x, y);
      return this;
    },
    lineTo(x, y) {
      count('lineTo', [x, y]);
      lineTo(x, y);
      return this;
    },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
      count('bezierCurveTo', [c1x, c1y, c2x, c2y, x, y]);
      if (!current) moveTo(c1x, c1y);
      curveTo(map(c1x, c1y), map(c2x, c2y), map(x, y));
      return this;
    },
    quadraticCurveTo(cx, cy, x, y) {
      count('quadraticCurveTo', [cx, cy, x, y]);
      if (!current) moveTo(cx, cy);
      const from = current ?? map(cx, cy);
      const control = map(cx, cy);
      const to = map(x, y);
      const toward = (p: Point): Point => ({
        x: p.x + (2 / 3) * (control.x - p.x),
        y: p.y + (2 / 3) * (control.y - p.y),
      });
      curveTo(toward(from), toward(to), to);
      return this;
    },
    closePath() {
      count('closePath', []);
      closePath();
      return this;
    },
    rect(x, y, width, height) {
      count('rect', [x, y, width, height]);
      moveTo(x, y);
      lineTo(x + width, y);
      lineTo(x + width, y + height);
      lineTo(x, y + height);
      closePath();
      return this;
    },
    roundedRect(x, y, width, height, radius) {
      count('roundedRect', [x, y, width, height, radius]);
      notNegative('roundedRect', radius);
      const left = Math.min(x, x + width);
      const top = Math.min(y, y + height);
      const w = Math.abs(width);
      const h = Math.abs(height);
      const r = Math.min(radius, w / 2, h / 2);
      const k = r * (1 - KAPPA);
      const [right, bottom] = [left + w, top + h];
      moveTo(left + r, top);
      lineTo(right - r, top);
      curveTo(map(right - k, top), map(right, top + k), map(right, top + r));
      lineTo(right, bottom - r);
      curveTo(map(right, bottom - k), map(right - k, bottom), map(right - r, bottom));
      lineTo(left + r, bottom);
      curveTo(map(left + k, bottom), map(left, bottom - k), map(left, bottom - r));
      lineTo(left, top + r);
      curveTo(map(left, top + k), map(left + k, top), map(left + r, top));
      closePath();
      return this;
    },
    circle(cx, cy, radius) {
      count('circle', [cx, cy, radius]);
      notNegative('circle', radius);
      ellipse(cx, cy, radius, radius);
      return this;
    },
    ellipse(cx, cy, radiusX, radiusY = radiusX) {
      count('ellipse', [cx, cy, radiusX, radiusY]);
      notNegative('ellipse', radiusX);
      notNegative('ellipse', radiusY);
      ellipse(cx, cy, radiusX, radiusY);
      return this;
    },
    polygon(...points) {
      count('polygon', [], points.length);
      const pairs = points as readonly unknown[];
      for (const point of pairs) {
        check(Array.isArray(point) && point.length === 2, 'polygon points must be [x, y] pairs');
        count('polygon', point as readonly unknown[], -1);
      }
      points.forEach(([x, y], index) => {
        if (index === 0) moveTo(x, y);
        else lineTo(x, y);
      });
      closePath();
      return this;
    },

    fill(fill, rule) {
      count('fill', []);
      const kind = ruleOf(rule);
      paintPath(fill === undefined ? state.fill : ink(fill), null, kind);
      return this;
    },
    stroke(stroke) {
      count('stroke', []);
      paintPath(null, stroke === undefined ? state.stroke : ink(stroke), 'nonzero');
      return this;
    },
    fillAndStroke(fill, stroke) {
      count('fillAndStroke', []);
      const fillColor = fill === undefined ? state.fill : ink(fill);
      paintPath(fillColor, stroke === undefined ? state.stroke : ink(stroke), 'nonzero');
      return this;
    },

    lineWidth(width) {
      count('lineWidth', [width]);
      check(width >= 0, 'lineWidth must not be negative');
      state = { ...state, lineWidth: width };
      return this;
    },
    lineCap(cap) {
      count('lineCap', []);
      check(CAPS.includes(cap), `unknown lineCap "${shown(cap)}"`);
      state = { ...state, cap };
      return this;
    },
    lineJoin(join) {
      count('lineJoin', []);
      check(JOINS.includes(join), `unknown lineJoin "${shown(join)}"`);
      state = { ...state, join };
      return this;
    },
    dash(pattern, phase = 0) {
      const lengths: readonly unknown[] = Array.isArray(pattern) ? pattern : [pattern, pattern];
      count('dash', [phase], Array.isArray(pattern) ? lengths.length : 0);
      count('dash', lengths, -1);
      const numbers = lengths as readonly number[];
      check(
        numbers.length > 0 && numbers.every((length) => length > 0),
        'dash lengths must be greater than 0',
      );
      state = { ...state, dash: { pattern: [...numbers], phase } };
      return this;
    },
    undash() {
      count('undash', []);
      state = { ...state, dash: null };
      return this;
    },
    fillColor(value) {
      count('fillColor', []);
      state = { ...state, fill: ink(value) };
      return this;
    },
    strokeColor(value) {
      count('strokeColor', []);
      state = { ...state, stroke: ink(value) };
      return this;
    },
    opacity(opacity) {
      count('opacity', [opacity]);
      check(opacity >= 0 && opacity <= 1, 'opacity must be between 0 and 1');
      state = { ...state, opacity };
      return this;
    },
    save() {
      count('save', []);
      saved.push(state);
      return this;
    },
    restore() {
      count('restore', []);
      const previous = saved.pop();
      check(previous !== undefined, 'restore without a save');
      state = previous;
      return this;
    },

    translate(x, y) {
      count('translate', [x, y]);
      state = { ...state, matrix: multiply(state.matrix, [1, 0, 0, 1, x, y]) };
      return this;
    },
    rotate(degrees) {
      count('rotate', [degrees]);
      const angle = (degrees * Math.PI) / 180;
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      state = { ...state, matrix: multiply(state.matrix, [cos, sin, -sin, cos, 0, 0]) };
      return this;
    },
    scale(x, y = x) {
      count('scale', [x, y]);
      state = { ...state, matrix: multiply(state.matrix, [x, 0, 0, y, 0, 0]) };
      return this;
    },
  };

  try {
    (paint as (ctx: PdfCanvasContext, size: PdfCanvasSize) => unknown)(ctx, {
      width: size.width,
      height: size.height,
    });
  } catch (error) {
    if (error instanceof Error && own.has(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    fail(`paint failed: ${message}`);
  } finally {
    open = false;
  }
  return shapes;
}
