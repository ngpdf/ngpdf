import { describe, expect, it } from 'vitest';
import type { PathSegment } from '../writer';
import { boundsOf, shapeSegments } from './shapes';
import { parseXml } from './xml';

const VIEWPORT = { width: 200, height: 100 };
const segmentsOf = (markup: string): readonly PathSegment[] | null =>
  shapeSegments(
    parseXml(markup, () => undefined),
    VIEWPORT,
  );
const kinds = (segments: readonly PathSegment[] | null): string =>
  (segments ?? []).map((segment) => segment.kind[0]).join('');

describe('shapeSegments', () => {
  it('draws a rect as a closed path', () => {
    expect(segmentsOf('<rect x="1" y="2" width="10" height="20"/>')).toEqual([
      { kind: 'move', to: { x: 1, y: 2 } },
      { kind: 'line', to: { x: 11, y: 2 } },
      { kind: 'line', to: { x: 11, y: 22 } },
      { kind: 'line', to: { x: 1, y: 22 } },
      { kind: 'close' },
    ]);
  });

  it('takes percentages of the viewport', () => {
    const bounds = boundsOf(segmentsOf('<rect width="50%" height="50%"/>') ?? []);
    expect(bounds).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });

  it('rounds a rect, one radius standing for both and capped to half the side', () => {
    expect(kinds(segmentsOf('<rect width="10" height="20" rx="2"/>'))).toBe('mlclclclcc');
    const capped = boundsOf(segmentsOf('<rect width="10" height="20" ry="50"/>') ?? []);
    expect(capped).toEqual({ x: 0, y: 0, w: 10, h: 20 });
    expect(kinds(segmentsOf('<rect width="10" height="20" rx="0"/>'))).toBe('mlllc');
  });

  it('draws nothing for a rect with no area or a bad length', () => {
    expect(segmentsOf('<rect width="0" height="10"/>')).toBeNull();
    expect(segmentsOf('<rect width="10"/>')).toBeNull();
    expect(segmentsOf('<rect width="-1" height="10"/>')).toBeNull();
    expect(segmentsOf('<rect width="1em" height="10"/>')).toBeNull();
  });

  it('draws circles and ellipses as four curves', () => {
    const circle = segmentsOf('<circle cx="10" cy="10" r="5"/>');
    expect(kinds(circle)).toBe('mccccc');
    expect(boundsOf(circle ?? [])).toEqual({ x: 5, y: 5, w: 10, h: 10 });
    const ellipse = boundsOf(segmentsOf('<ellipse cx="10" cy="10" rx="5" ry="2"/>') ?? []);
    expect(ellipse.w).toBeCloseTo(10);
    expect(ellipse.h).toBeCloseTo(4);
    // SVG 2: auto takes the other radius.
    expect(boundsOf(segmentsOf('<ellipse rx="5"/>') ?? []).h).toBeCloseTo(10);
    expect(segmentsOf('<circle r="0"/>')).toBeNull();
    expect(segmentsOf('<ellipse rx="0" ry="3"/>')).toBeNull();
    expect(segmentsOf('<ellipse/>')).toBeNull();
  });

  it('draws lines, polylines and polygons', () => {
    expect(kinds(segmentsOf('<line x1="0" y1="0" x2="10" y2="10"/>'))).toBe('ml');
    expect(kinds(segmentsOf('<polyline points="0,0 10,0 10,10"/>'))).toBe('mll');
    expect(kinds(segmentsOf('<polygon points="0 0 10 0 10 10"/>'))).toBe('mllc');
    // An odd number of coordinates drops the last one; one point draws nothing.
    expect(kinds(segmentsOf('<polyline points="0 0 10 0 10"/>'))).toBe('ml');
    expect(segmentsOf('<polygon points="0 0"/>')).toBeNull();
    expect(segmentsOf('<polygon points="0 0 x"/>')).toBeNull();
    expect(segmentsOf('<polyline/>')).toBeNull();
  });

  it('reads path data, drawing nothing for a path with no lines or curves', () => {
    expect(kinds(segmentsOf('<path d="M0 0 L10 10"/>'))).toBe('ml');
    expect(segmentsOf('<path d="M0 0"/>')).toBeNull();
    expect(segmentsOf('<path/>')).toBeNull();
  });

  it('is null for an element that is no shape', () => {
    expect(segmentsOf('<g/>')).toBeNull();
  });
});

describe('boundsOf', () => {
  it('takes the extremes of curves, not their control points', () => {
    const bounds = boundsOf([
      { kind: 'move', to: { x: 0, y: 0 } },
      { kind: 'curve', c1: { x: 0, y: 10 }, c2: { x: 10, y: 10 }, to: { x: 10, y: 0 } },
    ]);
    expect(bounds.x).toBe(0);
    expect(bounds.w).toBe(10);
    expect(bounds.h).toBeCloseTo(7.5);
  });

  it('is empty for no points', () => {
    expect(boundsOf([{ kind: 'close' }])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});
