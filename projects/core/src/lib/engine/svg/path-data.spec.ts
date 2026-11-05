import { describe, expect, it } from 'vitest';
import type { PathSegment, Point } from '../writer';
import { parsePathData } from './path-data';

const move = (x: number, y: number): PathSegment => ({ kind: 'move', to: { x, y } });
const line = (x: number, y: number): PathSegment => ({ kind: 'line', to: { x, y } });
const curve = (c1: [number, number], c2: [number, number], to: [number, number]): PathSegment => ({
  kind: 'curve',
  c1: { x: c1[0], y: c1[1] },
  c2: { x: c2[0], y: c2[1] },
  to: { x: to[0], y: to[1] },
});
const close: PathSegment = { kind: 'close' };

function endOf(segment: PathSegment | undefined): Point {
  if (!segment || segment.kind === 'close') throw new Error('no end point');
  return segment.to;
}

describe('parsePathData', () => {
  it('reads absolute moves, lines and closes', () => {
    expect(parsePathData('M10 20 L30 40 H 50 V60 Z')).toEqual({
      segments: [move(10, 20), line(30, 40), line(50, 40), line(50, 60), close],
    });
  });

  it('reads relative commands from the current point', () => {
    expect(parsePathData('m10 20 l5 5 h10 v-5 z').segments).toEqual([
      move(10, 20),
      line(15, 25),
      line(25, 25),
      line(25, 20),
      close,
    ]);
  });

  it('repeats a command for extra arguments, a move as lines', () => {
    expect(parsePathData('M0 0 10 0 10 10 L 20 20 30 30').segments).toEqual([
      move(0, 0),
      line(10, 0),
      line(10, 10),
      line(20, 20),
      line(30, 30),
    ]);
    expect(parsePathData('m1 1 2 0 0 2').segments).toEqual([move(1, 1), line(3, 1), line(3, 3)]);
  });

  it('starts a new subpath at the start point after a close', () => {
    expect(parsePathData('M10 10 l10 0 z l0 10').segments).toEqual([
      move(10, 10),
      line(20, 10),
      close,
      move(10, 10),
      line(10, 20),
    ]);
    expect(parsePathData('M10 10 l10 0 z m5 5 l1 0').segments).toEqual([
      move(10, 10),
      line(20, 10),
      close,
      move(15, 15),
      line(16, 15),
    ]);
  });

  it('reads compact numbers', () => {
    expect(parsePathData('M.5.5L-1-2l1e1,5E-1').segments).toEqual([
      move(0.5, 0.5),
      line(-1, -2),
      line(9, -1.5),
    ]);
    expect(parsePathData('M+1,+2 L3.e1 4').segments).toEqual([move(1, 2), line(30, 4)]);
  });

  it('reads cubic curves and reflects the control point for S', () => {
    expect(parsePathData('M0 0 C 0 10 10 10 10 0 S 20 -10 20 0').segments).toEqual([
      move(0, 0),
      curve([0, 10], [10, 10], [10, 0]),
      curve([10, -10], [20, -10], [20, 0]),
    ]);
    expect(parsePathData('M0 0 c 0 10 10 10 10 0 s 10 -10 10 0').segments.at(-1)).toEqual(
      curve([10, -10], [20, -10], [20, 0]),
    );
  });

  it('takes the current point as the first control point of an S after no curve', () => {
    expect(parsePathData('M0 0 L 10 0 S 20 10 30 0').segments.at(-1)).toEqual(
      curve([10, 0], [20, 10], [30, 0]),
    );
  });

  it('turns quadratic curves into cubic ones and reflects for T', () => {
    expect(parsePathData('M0 0 Q 15 30 30 0 T 60 0').segments).toEqual([
      move(0, 0),
      curve([10, 20], [20, 20], [30, 0]),
      curve([40, -20], [50, -20], [60, 0]),
    ]);
    expect(parsePathData('m0 0 q 15 30 30 0 t 30 0').segments.at(-1)).toEqual(
      curve([40, -20], [50, -20], [60, 0]),
    );
    expect(parsePathData('M0 0 T 30 0').segments.at(-1)).toEqual(curve([0, 0], [10, 0], [30, 0]));
  });

  describe('arcs', () => {
    it('draws a half circle as two quarter curves', () => {
      const { segments } = parsePathData('M0 0 A10 10 0 0 1 20 0');
      expect(segments).toHaveLength(3);
      const mid = endOf(segments[1]);
      expect(mid.x).toBeCloseTo(10);
      expect(mid.y).toBeCloseTo(-10);
      expect(endOf(segments[2])).toEqual({ x: 20, y: 0 });
      // A quarter circle's control points sit 0.5523 of the radius along the tangents.
      const first = segments[1];
      if (first?.kind !== 'curve') throw new Error('not a curve');
      expect(first.c1.x).toBeCloseTo(0);
      expect(first.c1.y).toBeCloseTo(-5.523, 3);
    });

    it('follows the sweep flag', () => {
      const { segments } = parsePathData('M0 0 A10 10 0 0 0 20 0');
      expect(endOf(segments[1]).y).toBeCloseTo(10);
    });

    it('takes the large arc with the flag set', () => {
      const small = parsePathData('M0 0 a10 10 0 0 1 10 10').segments;
      const large = parsePathData('M0 0 a10 10 0 1 1 10 10').segments;
      expect(small).toHaveLength(2);
      expect(large).toHaveLength(4);
      expect(endOf(large.at(-1))).toEqual({ x: 10, y: 10 });
    });

    it('reads flags written without separators', () => {
      expect(parsePathData('M0 0 a10 10 0 1110 10').segments).toEqual(
        parsePathData('M0 0 a10 10 0 1 1 10 10').segments,
      );
    });

    it('scales up radii too small to reach the end point', () => {
      const { segments } = parsePathData('M0 0 A1 1 0 0 1 20 0');
      expect(endOf(segments[1]).y).toBeCloseTo(-10);
    });

    it('rotates the ellipse by its x-axis rotation', () => {
      const { segments } = parsePathData('M0 0 A20 10 90 0 1 0 40');
      // Rotated 90°, the long axis is vertical: a half ellipse 10 wide.
      expect(endOf(segments[1]).x).toBeCloseTo(10);
      expect(endOf(segments[1]).y).toBeCloseTo(20);
    });

    it('draws a line for a zero radius and nothing to the same point', () => {
      expect(parsePathData('M0 0 A0 10 0 0 1 20 0').segments).toEqual([move(0, 0), line(20, 0)]);
      expect(parsePathData('M5 5 A10 10 0 0 1 5 5').segments).toEqual([move(5, 5)]);
    });

    it('uses the radii as absolute values', () => {
      expect(parsePathData('M0 0 A-10 -10 0 0 1 20 0').segments).toEqual(
        parsePathData('M0 0 A10 10 0 0 1 20 0').segments,
      );
    });
  });

  describe('stops at the first error and keeps what came before', () => {
    it.each([
      ['L 10 10', 0, 0],
      ['M 10', 4, 0],
      ['M0 0 L 10 x', 10, 1],
      ['M0 0 L', 6, 1],
      ['M0 0 Z 5 5', 7, 2],
      ['M0 0 A10 10 0 2 1 20 0', 14, 1],
      ['M0 0 X', 5, 1],
      ['M0 0 L1e999 0', 6, 1],
      ['M0 0,,L1 1', 5, 1],
    ])('%j', (d, at, kept) => {
      const parsed = parsePathData(d);
      expect(parsed.error).toBe(at);
      expect(parsed.segments).toHaveLength(kept);
    });

    it('gives nothing for an empty path', () => {
      expect(parsePathData('  ')).toEqual({ segments: [] });
    });
  });

  it('stays linear on long input', () => {
    const d = `M0 0 ${'a5 5 0 1 1 10 0 '.repeat(20_000)}${'l1 1'.repeat(70_000)}`;
    const started = performance.now();
    expect(parsePathData(d).segments.length).toBeGreaterThan(100_000);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
