import { toHex, type Color } from './color';
import type { ColorStop, Gradient, StopPosition } from './style';
import type { GradientFill, GradientStop } from './writer';

export interface GradientArea {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Stands in for a zero length or radius, so the shading stays a valid one. */
const TINY = 1e-3;

interface Placed {
  readonly at: number;
  readonly color: Color;
}

/** Points along a line of `length`. */
function pointsOf(position: StopPosition, length: number): number {
  return typeof position === 'number' ? position : (position.percent / 100) * length;
}

/**
 * CSS stop fixup: the first stop defaults to 0 and the last to the length, a stop never sits
 * before an earlier one, and unpositioned stops share the space between their neighbours.
 */
function placeStops(stops: readonly ColorStop[], length: number): Placed[] {
  const at = stops.map((stop) => (stop.position === null ? null : pointsOf(stop.position, length)));
  const last = at.length - 1;
  at[0] ??= 0;
  at[last] ??= length;
  let max = -Infinity;
  for (const [i, value] of at.entries()) {
    if (value !== null) {
      max = Math.max(max, value);
      at[i] = max;
    }
  }
  let previous = 0;
  for (let i = 1; i <= last; i++) {
    const end = at[i];
    if (end === null || end === undefined) continue;
    const start = at[previous] ?? 0;
    for (let k = previous + 1; k < i; k++) {
      at[k] = start + ((end - start) * (k - previous)) / (i - previous);
    }
    previous = i;
  }
  return stops.map((stop, i) => ({ at: at[i] ?? 0, color: stop.color }));
}

function mix(a: Color, b: Color, t: number): Color {
  const channel = (x: number, y: number) => Math.round(x + (y - x) * t);
  return {
    r: channel(a.r, b.r),
    g: channel(a.g, b.g),
    b: channel(a.b, b.b),
    a: a.a + (b.a - a.a) * t,
  };
}

/** A radial gradient's ray starts at the center: stops before it give way to the color at 0. */
function cutBeforeCenter(placed: readonly Placed[]): Placed[] {
  const kept = placed.filter((stop) => stop.at >= 0);
  const firstKept = placed.length - kept.length;
  const before = placed[firstKept - 1];
  if (!before) return kept;
  const after = kept[0];
  if (!after) return [{ at: 0, color: before.color }];
  const t = -before.at / (after.at - before.at);
  return [{ at: 0, color: mix(before.color, after.color, t) }, ...kept];
}

const sameRgb = (a: Color, b: Color) => a.r === b.r && a.g === b.g && a.b === b.b;

/**
 * CSS blends stops with premultiplied alpha, PDF blends color and opacity apart. A transparent
 * stop takes its neighbours' color, so `red, transparent` fades red instead of through black.
 */
function premultiplyFix(placed: readonly Placed[]): Placed[] {
  const out: Placed[] = [];
  for (const [i, stop] of placed.entries()) {
    if (stop.color.a > 0) {
      out.push(stop);
      continue;
    }
    const neighbours = [placed[i - 1], placed[i + 1]].filter(
      (other): other is Placed => other !== undefined && other.color.a > 0,
    );
    const [first, second] = neighbours;
    if (!first) out.push(stop);
    else if (second && !sameRgb(first.color, second.color)) {
      out.push({ at: stop.at, color: { ...first.color, a: 0 } });
      out.push({ at: stop.at, color: { ...second.color, a: 0 } });
    } else out.push({ at: stop.at, color: { ...first.color, a: 0 } });
  }
  return out;
}

/** Room added past a hard edge at an end of the span, in points. */
const PAD = 1;

/**
 * The span from the first stop to the last, with each stop's offset in it. A hard edge at either
 * end gets a solid stretch past it: PDF extends a shading with the color at 0 or 1, and two stops
 * at 0 would extend the second one's color.
 */
function spanOf(
  placed: readonly Placed[],
  opacity: number,
  lowest: number,
): { start: number; length: number; stops: GradientStop[] } {
  const padded = [...placed];
  const first = padded[0];
  const last = padded[padded.length - 1];
  if (first && padded[1]?.at === first.at && first.at - PAD >= lowest) {
    padded.unshift({ at: first.at - PAD, color: first.color });
  }
  if (last && (padded.length === 1 || padded[padded.length - 2]?.at === last.at)) {
    padded.push({ at: last.at + PAD, color: last.color });
  }
  const start = padded[0]?.at ?? 0;
  const end = padded[padded.length - 1]?.at ?? start;
  const length = Math.max(end - start, TINY);
  const stops = padded.map((stop) => ({
    offset: Math.min(1, Math.max(0, (stop.at - start) / length)),
    color: toHex(stop.color),
    opacity: stop.color.a * opacity,
  }));
  return { start, length, stops };
}

function linearFill(
  gradient: Extract<Gradient, { kind: 'linear' }>,
  area: GradientArea,
  opacity: number,
): GradientFill | null {
  const { w, h } = area;
  let dx: number;
  let dy: number;
  if ('corner' in gradient.direction) {
    // Perpendicular to the diagonal between the two other corners.
    const { x, y } = gradient.direction.corner;
    const norm = Math.hypot(w, h);
    if (norm === 0) return null;
    dx = (x * h) / norm;
    dy = (y * w) / norm;
  } else {
    const angle = (gradient.direction.angle * Math.PI) / 180;
    // Rounded so the side keywords give exact axes.
    dx = Math.round(Math.sin(angle) * 1e12) / 1e12;
    dy = -Math.round(Math.cos(angle) * 1e12) / 1e12;
  }
  const line = Math.abs(w * dx) + Math.abs(h * dy);
  if (line <= 0) return null;
  const placed = premultiplyFix(placeStops(gradient.stops, line));
  if (placed.every((stop) => stop.color.a <= 0)) return null;
  const { start, length, stops } = spanOf(placed, opacity, -Infinity);
  const cx = area.x + w / 2;
  const cy = area.y + h / 2;
  const from = start - line / 2;
  const to = from + length;
  return {
    kind: 'linear',
    x1: cx + dx * from,
    y1: cy + dy * from,
    x2: cx + dx * to,
    y2: cy + dy * to,
    stops,
  };
}

/** The ending shape's radii, as CSS sizes it from the center at (px, py) in the area. */
function radiiOf(
  gradient: Extract<Gradient, { kind: 'radial' }>,
  px: number,
  py: number,
  w: number,
  h: number,
): { rx: number; ry: number } {
  const xs = [Math.abs(px), Math.abs(w - px)];
  const ys = [Math.abs(py), Math.abs(h - py)];
  const corners = xs.flatMap((x) => ys.map((y) => ({ x, y })));
  const closest = gradient.size.startsWith('closest');
  const pick = (values: number[]) => (closest ? Math.min(...values) : Math.max(...values));
  const corner = corners.reduce((best, next) =>
    closest === Math.hypot(next.x, next.y) < Math.hypot(best.x, best.y) ? next : best,
  );
  if (gradient.shape === 'circle') {
    if (gradient.size.endsWith('side')) {
      const r = pick([...xs, ...ys]);
      return { rx: r, ry: r };
    }
    const r = Math.hypot(corner.x, corner.y);
    return { rx: r, ry: r };
  }
  const sx = pick(xs);
  const sy = pick(ys);
  if (gradient.size.endsWith('side') || sx <= 0 || sy <= 0) return { rx: sx, ry: sy };
  // Through the corner, in the ratio the matching side keyword gives.
  const rx = Math.hypot(corner.x, (corner.y * sx) / sy);
  return { rx, ry: (rx * sy) / sx };
}

function radialFill(
  gradient: Extract<Gradient, { kind: 'radial' }>,
  area: GradientArea,
  opacity: number,
): GradientFill | null {
  const { w, h } = area;
  const px = pointsOf(gradient.center.x, w);
  const py = pointsOf(gradient.center.y, h);
  const radii = radiiOf(gradient, px, py, w, h);
  const rx = Math.max(radii.rx, TINY);
  const ry = Math.max(radii.ry, TINY);
  const placed = premultiplyFix(cutBeforeCenter(placeStops(gradient.stops, rx)));
  if (placed.every((stop) => stop.color.a <= 0)) return null;
  const { start, length, stops } = spanOf(placed, opacity, 0);
  return {
    kind: 'radial',
    cx: area.x + px,
    cy: area.y + py,
    r1: start,
    r2: start + length,
    scaleY: ry / rx,
    stops,
  };
}

/**
 * The shading of `gradient` over `area`, the whole border box (all of it, also when only a
 * slice is on this page). Null when it paints nothing.
 */
export function gradientFill(
  gradient: Gradient,
  area: GradientArea,
  opacity: number,
): GradientFill | null {
  return gradient.kind === 'linear'
    ? linearFill(gradient, area, opacity)
    : radialFill(gradient, area, opacity);
}
