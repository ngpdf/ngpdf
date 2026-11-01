import { describe, expect, it, vi } from 'vitest';
import type { PdfCanvasContext, PdfCanvasPaint } from '../tree/canvas-context';
import { MAX_CANVAS_CALLS, recordCanvas } from './canvas-recorder';
import type { PathSegment } from './writer';

const SIZE = { width: 200, height: 100 };

function record(paint: PdfCanvasPaint, size = SIZE) {
  return recordCanvas(paint, size);
}

/** Every point of the path, rounded so trigonometry noise does not matter. */
function points(segments: readonly PathSegment[]): [number, number][] {
  const out: [number, number][] = [];
  for (const segment of segments) {
    if (segment.kind === 'close') continue;
    const all = segment.kind === 'curve' ? [segment.c1, segment.c2, segment.to] : [segment.to];
    for (const point of all) out.push([round(point.x), round(point.y)]);
  }
  return out;
}

const round = (value: number): number => Math.round(value * 1000) / 1000 + 0;

describe('recordCanvas', () => {
  it('passes the context and the size to paint', () => {
    let seen: unknown;
    record((ctx, size) => {
      seen = size;
      expect(ctx.moveTo(0, 0)).toBe(ctx);
    });
    expect(seen).toEqual(SIZE);
  });

  it('records a stroked path with the default line settings, in black', () => {
    const [shape, ...rest] = record((ctx) => ctx.moveTo(10, 20).lineTo(30, 40).stroke());
    expect(rest).toEqual([]);
    expect(shape).toEqual({
      op: 'shape',
      segments: [
        { kind: 'move', to: { x: 10, y: 20 } },
        { kind: 'line', to: { x: 30, y: 40 } },
      ],
      stroke: { color: '#000000', opacity: 1, width: 1, cap: 'butt', join: 'miter' },
    });
  });

  it('records curves and a close, turning a quadratic curve into a cubic one', () => {
    const [shape] = record((ctx) =>
      ctx
        .moveTo(0, 0)
        .bezierCurveTo(1, 2, 3, 4, 5, 6)
        .quadraticCurveTo(8, 6, 11, 6)
        .closePath()
        .fill(),
    );
    expect(shape?.segments).toEqual([
      { kind: 'move', to: { x: 0, y: 0 } },
      { kind: 'curve', c1: { x: 1, y: 2 }, c2: { x: 3, y: 4 }, to: { x: 5, y: 6 } },
      { kind: 'curve', c1: { x: 7, y: 6 }, c2: { x: 9, y: 6 }, to: { x: 11, y: 6 } },
      { kind: 'close' },
    ]);
    expect(shape?.fill).toEqual({ color: '#000000', opacity: 1, rule: 'nonzero' });
    expect(shape?.stroke).toBeUndefined();
  });

  it('starts a subpath at the first point of a line or curve drawn with no current point', () => {
    const [line] = record((ctx) => ctx.lineTo(5, 5).lineTo(6, 6).stroke());
    expect(points(line!.segments)).toEqual([
      [5, 5],
      [5, 5],
      [6, 6],
    ]);
    expect(line?.segments[0]?.kind).toBe('move');
    const [curve] = record((ctx) => ctx.quadraticCurveTo(3, 0, 6, 0).stroke());
    expect(curve?.segments[0]).toEqual({ kind: 'move', to: { x: 3, y: 0 } });
  });

  it('records rect, roundedRect, circle, ellipse and polygon as closed subpaths', () => {
    const [shape] = record((ctx) =>
      ctx
        .rect(0, 0, 10, 20)
        .roundedRect(0, 0, 10, 10, 100)
        .circle(50, 50, 10)
        .ellipse(0, 0, 4, 2)
        .polygon([0, 0], [10, 0], [5, 5])
        .fill(),
    );
    const kinds = shape!.segments.map((segment) => segment.kind);
    expect(kinds).toEqual([
      ...['move', 'line', 'line', 'line', 'close'],
      // A radius larger than half a side is cut to it: four lines of length 0 and four arcs.
      ...['move', 'line', 'curve', 'line', 'curve', 'line', 'curve', 'line', 'curve', 'close'],
      ...['move', 'curve', 'curve', 'curve', 'curve', 'close'],
      ...['move', 'curve', 'curve', 'curve', 'curve', 'close'],
      ...['move', 'line', 'line', 'close'],
    ]);
    expect(points(shape!.segments.slice(0, 4))).toEqual([
      [0, 0],
      [10, 0],
      [10, 20],
      [0, 20],
    ]);
    const circle = points(shape!.segments.slice(15, 20));
    expect(circle[0]).toEqual([60, 50]);
    for (const end of [circle[3], circle[6], circle[9], circle[12]]) {
      expect(Math.hypot(end![0] - 50, end![1] - 50)).toBeCloseTo(10, 6);
    }
    const ellipse = points(shape!.segments.slice(21, 26));
    expect(ellipse.filter((_, i) => i === 0 || i % 3 === 0)).toEqual([
      [4, 0],
      [0, 2],
      [-4, 0],
      [0, -2],
      [4, 0],
    ]);
  });

  it('rounds the corners of roundedRect with radii cut to half the shorter side', () => {
    const [shape] = record((ctx) => ctx.roundedRect(0, 0, 20, 10, 100).fill());
    const ends = shape!.segments
      .filter((segment) => segment.kind !== 'close')
      .map((segment) => [round(segment.to.x), round(segment.to.y)]);
    expect(ends).toEqual([
      [5, 0],
      [15, 0],
      [20, 5],
      [20, 5],
      [15, 10],
      [5, 10],
      [0, 5],
      [0, 5],
      [5, 0],
    ]);
    const [flipped] = record((ctx) => ctx.roundedRect(20, 10, -20, -10, 100).fill());
    expect(flipped).toEqual(shape);
  });

  it('continues from the start of a closed subpath', () => {
    const [shape] = record((ctx) =>
      ctx.moveTo(0, 0).lineTo(9, 0).closePath().quadraticCurveTo(3, 0, 6, 0).stroke(),
    );
    expect(shape?.segments[3]).toEqual({
      kind: 'curve',
      c1: { x: 2, y: 0 },
      c2: { x: 4, y: 0 },
      to: { x: 6, y: 0 },
    });
  });

  it('takes colors as the color style does, with their alpha and the opacity in the op', () => {
    const shapes = record((ctx) =>
      ctx
        .rect(0, 0, 1, 1)
        .fill('rgb(255 0 0 / 50%)', 'evenodd')
        .fillColor('Blue')
        .strokeColor('#00ff0080')
        .opacity(0.5)
        .rect(0, 0, 1, 1)
        .fillAndStroke()
        .rect(0, 0, 1, 1)
        .fillAndStroke('white', 'black')
        .rect(0, 0, 1, 1)
        .stroke('red'),
    );
    expect(shapes.map((shape) => shape.fill)).toEqual([
      { color: '#ff0000', opacity: 0.5, rule: 'evenodd' },
      { color: '#0000ff', opacity: 0.5, rule: 'nonzero' },
      { color: '#ffffff', opacity: 0.5, rule: 'nonzero' },
      undefined,
    ]);
    expect(
      shapes.map((shape) => shape.stroke && [shape.stroke.color, shape.stroke.opacity]),
    ).toEqual([undefined, ['#00ff00', 0.5 * (0x80 / 255)], ['#000000', 0.5], ['#ff0000', 0.5]]);
  });

  it('uses a color passed to a paint for that paint only', () => {
    const shapes = record((ctx) => ctx.rect(0, 0, 1, 1).fill('red').rect(0, 0, 1, 1).fill());
    expect(shapes.map((shape) => shape.fill?.color)).toEqual(['#ff0000', '#000000']);
  });

  it('starts a new path after each paint, and records nothing for an empty one', () => {
    const shapes = record((ctx) => ctx.fill().stroke().rect(0, 0, 1, 1).fill().stroke());
    expect(shapes).toHaveLength(1);
  });

  it('records nothing for a paint left with no ink: transparent, opacity 0 or line width 0', () => {
    const shapes = record((ctx) =>
      ctx
        .rect(0, 0, 1, 1)
        .fill('transparent')
        .rect(0, 0, 1, 1)
        .lineWidth(0)
        .stroke()
        .rect(0, 0, 1, 1)
        .fillAndStroke('red', 'blue')
        .opacity(0)
        .rect(0, 0, 1, 1)
        .fill(),
    );
    expect(shapes).toHaveLength(1);
    expect(shapes[0]?.fill?.color).toBe('#ff0000');
    expect(shapes[0]?.stroke).toBeUndefined();
  });

  it('records the line settings and the dash of each stroke', () => {
    const shapes = record((ctx) =>
      ctx
        .lineWidth(3)
        .lineCap('round')
        .lineJoin('bevel')
        .dash([4, 2], 1)
        .moveTo(0, 0)
        .lineTo(1, 0)
        .stroke()
        .dash(5)
        .moveTo(0, 0)
        .lineTo(1, 0)
        .stroke()
        .undash()
        .lineCap('square')
        .lineJoin('round')
        .moveTo(0, 0)
        .lineTo(1, 0)
        .stroke(),
    );
    expect(shapes.map((shape) => shape.stroke)).toEqual([
      {
        color: '#000000',
        opacity: 1,
        width: 3,
        cap: 'round',
        join: 'bevel',
        dash: { pattern: [4, 2], phase: 1 },
      },
      {
        color: '#000000',
        opacity: 1,
        width: 3,
        cap: 'round',
        join: 'bevel',
        dash: { pattern: [5, 5], phase: 0 },
      },
      { color: '#000000', opacity: 1, width: 3, cap: 'square', join: 'round' },
    ]);
  });

  it('maps points through translate, rotate (degrees, clockwise) and scale', () => {
    const [shape] = record((ctx) =>
      ctx.translate(100, 50).rotate(90).scale(2, 3).moveTo(1, 1).lineTo(2, 0).stroke(),
    );
    // scale first, then the quarter turn (x, y) -> (-y, x), then the move.
    expect(points(shape!.segments)).toEqual([
      [97, 52],
      [100, 54],
    ]);
  });

  it('scales the line width and the dash with the transform, by its area factor', () => {
    const [shape] = record((ctx) =>
      ctx.scale(2, 8).lineWidth(1).dash([1, 2], 3).moveTo(0, 0).lineTo(1, 0).stroke(),
    );
    expect(shape?.stroke).toMatchObject({ width: 4, dash: { pattern: [4, 8], phase: 12 } });
    const [uniform] = record((ctx) => ctx.scale(3).moveTo(0, 0).lineTo(1, 1).stroke());
    expect(uniform?.stroke?.width).toBe(3);
    expect(points(uniform!.segments)).toEqual([
      [0, 0],
      [3, 3],
    ]);
  });

  it('keeps a point where it was drawn when the transform changes before the paint', () => {
    const [shape] = record((ctx) => ctx.moveTo(1, 1).translate(10, 10).lineTo(1, 1).stroke());
    expect(points(shape!.segments)).toEqual([
      [1, 1],
      [11, 11],
    ]);
  });

  it('restores the colors, line settings, opacity and transform kept by save', () => {
    const shapes = record((ctx) =>
      ctx
        .fillColor('red')
        .strokeColor('blue')
        .lineWidth(2)
        .lineCap('round')
        .lineJoin('round')
        .dash(3)
        .opacity(0.5)
        .save()
        .fillColor('green')
        .strokeColor('white')
        .lineWidth(9)
        .lineCap('square')
        .lineJoin('bevel')
        .undash()
        .opacity(0.25)
        .translate(10, 0)
        .restore()
        .moveTo(0, 0)
        .lineTo(1, 0)
        .fillAndStroke(),
    );
    expect(points(shapes[0]!.segments)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(shapes[0]?.fill).toEqual({ color: '#ff0000', opacity: 0.5, rule: 'nonzero' });
    expect(shapes[0]?.stroke).toEqual({
      color: '#0000ff',
      opacity: 0.5,
      width: 2,
      cap: 'round',
      join: 'round',
      dash: { pattern: [3, 3], phase: 0 },
    });
  });

  it('keeps the path across save and restore', () => {
    const [shape] = record((ctx) => ctx.moveTo(0, 0).save().lineTo(1, 1).restore().stroke());
    expect(shape?.segments).toHaveLength(2);
  });

  describe('errors', () => {
    const fails =
      (paint: PdfCanvasPaint): (() => unknown) =>
      () =>
        record(paint);

    it('throws on a non-finite number, naming the method', () => {
      expect(fails((ctx) => ctx.lineTo(Number.NaN, 0))).toThrow(
        'ngpdf: pdf-canvas lineTo got a non-finite number',
      );
      expect(fails((ctx) => ctx.translate(Infinity, 0))).toThrow(
        'ngpdf: pdf-canvas translate got a non-finite number',
      );
      expect(fails((ctx) => ctx.polygon([0, 0], [1, Number.NaN]))).toThrow(
        'ngpdf: pdf-canvas polygon got a non-finite number',
      );
      expect(fails((ctx) => ctx.dash([1, Infinity]))).toThrow(
        'ngpdf: pdf-canvas dash got a non-finite number',
      );
      expect(fails((ctx) => ctx.ellipse(0, 0, 1, '2' as unknown as number))).toThrow(
        'ngpdf: pdf-canvas ellipse got a non-finite number',
      );
    });

    it('throws on an unknown option', () => {
      expect(fails((ctx) => ctx.lineCap('flat' as never))).toThrow(
        'ngpdf: pdf-canvas unknown lineCap "flat"',
      );
      expect(fails((ctx) => ctx.lineJoin('sharp' as never))).toThrow(
        'ngpdf: pdf-canvas unknown lineJoin "sharp"',
      );
      expect(fails((ctx) => ctx.rect(0, 0, 1, 1).fill('red', 'odd' as never))).toThrow(
        'ngpdf: pdf-canvas unknown fill rule "odd"',
      );
    });

    it('throws on a bad color, a bad length and an unbalanced restore', () => {
      expect(fails((ctx) => ctx.fillColor('nope'))).toThrow(
        'ngpdf: invalid color "nope" on pdf-canvas',
      );
      expect(fails((ctx) => ctx.rect(0, 0, 1, 1).stroke('#12'))).toThrow(
        'ngpdf: invalid color "#12" on pdf-canvas',
      );
      expect(fails((ctx) => ctx.strokeColor(3 as unknown as string))).toThrow(
        'ngpdf: invalid color "3" on pdf-canvas',
      );
      expect(fails((ctx) => ctx.lineWidth(-1))).toThrow(
        'ngpdf: pdf-canvas lineWidth must not be negative',
      );
      expect(fails((ctx) => ctx.circle(0, 0, -1))).toThrow(
        'ngpdf: pdf-canvas circle must not have a negative radius',
      );
      expect(fails((ctx) => ctx.roundedRect(0, 0, 1, 1, -1))).toThrow(
        'ngpdf: pdf-canvas roundedRect must not have a negative radius',
      );
      expect(fails((ctx) => ctx.ellipse(0, 0, 1, -1))).toThrow(
        'ngpdf: pdf-canvas ellipse must not have a negative radius',
      );
      expect(fails((ctx) => ctx.dash([2, 0]))).toThrow(
        'ngpdf: pdf-canvas dash lengths must be greater than 0',
      );
      expect(fails((ctx) => ctx.dash([]))).toThrow(
        'ngpdf: pdf-canvas dash lengths must be greater than 0',
      );
      expect(fails((ctx) => ctx.opacity(1.5))).toThrow(
        'ngpdf: pdf-canvas opacity must be between 0 and 1',
      );
      expect(fails((ctx) => ctx.opacity(-0.1))).toThrow(
        'ngpdf: pdf-canvas opacity must be between 0 and 1',
      );
      expect(fails((ctx) => ctx.save().restore().restore())).toThrow(
        'ngpdf: pdf-canvas restore without a save',
      );
      expect(fails((ctx) => ctx.polygon([0, 0], 5 as never))).toThrow(
        'ngpdf: pdf-canvas polygon points must be [x, y] pairs',
      );
    });

    it(`throws past ${String(MAX_CANVAS_CALLS)} calls, counting each polygon point and dash length`, () => {
      expect(MAX_CANVAS_CALLS).toBe(100_000);
      const message = 'ngpdf: pdf-canvas made more than 100000 calls';
      expect(() =>
        record((ctx) => {
          for (let i = 0; i < MAX_CANVAS_CALLS; i++) ctx.moveTo(0, 0);
        }),
      ).not.toThrow();
      expect(() =>
        record((ctx) => {
          for (let i = 0; i <= MAX_CANVAS_CALLS; i++) ctx.moveTo(0, 0);
        }),
      ).toThrow(message);
      const many = Array.from({ length: MAX_CANVAS_CALLS }, (): [number, number] => [0, 0]);
      expect(fails((ctx) => ctx.polygon(...many))).toThrow(message);
      expect(fails((ctx) => ctx.dash(many.map(() => 1)))).toThrow(message);
    });

    it('counts the calls of each canvas apart', () => {
      const paint: PdfCanvasPaint = (ctx) => {
        for (let i = 0; i < MAX_CANVAS_CALLS; i++) ctx.moveTo(0, 0);
      };
      expect(() => {
        record(paint);
        record(paint);
      }).not.toThrow();
    });

    it('rejects a paint that is not a function', () => {
      expect(() => recordCanvas(undefined, SIZE)).toThrow(
        'ngpdf: pdf-canvas paint is not a function',
      );
    });

    it('wraps an error thrown by paint, keeping its own errors as they are', () => {
      expect(
        fails(() => {
          throw new Error('no data');
        }),
      ).toThrow('ngpdf: pdf-canvas paint failed: no data');
      expect(
        fails(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'plain';
        }),
      ).toThrow('ngpdf: pdf-canvas paint failed: plain');
      expect(fails((ctx) => ctx.lineTo(Number.NaN, 0))).toThrow(
        /^ngpdf: pdf-canvas lineTo got a non-finite number$/,
      );
    });

    it('keeps the error thrown by paint as the cause', () => {
      const original = new Error('no data');
      let caught: unknown;
      try {
        record(() => {
          throw original;
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).cause).toBe(original);
    });

    it('rejects an async paint, whose drawing would come after the render', async () => {
      // The plainest async paint: it returns a promise and nothing else.
      // eslint-disable-next-line @typescript-eslint/require-await
      const paint = (async () => undefined) as unknown as PdfCanvasPaint;
      expect(() => record(paint)).toThrow('ngpdf: pdf-canvas paint must be synchronous');
      const thenable = (() => ({ then: () => undefined })) as unknown as PdfCanvasPaint;
      expect(() => record(thenable)).toThrow('ngpdf: pdf-canvas paint must be synchronous');
      // A rejected promise is handled here, so it cannot surface as an unhandled rejection.
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        const failing = (async () => {
          await Promise.resolve();
          throw new Error('late');
        }) as unknown as PdfCanvasPaint;
        expect(() => record(failing)).toThrow('ngpdf: pdf-canvas paint must be synchronous');
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });

    it('throws when the context is used after paint returned', () => {
      let kept: PdfCanvasContext | undefined;
      record((ctx) => {
        kept = ctx;
      });
      expect(() => kept?.moveTo(0, 0)).toThrow(
        'ngpdf: pdf-canvas context used after paint returned',
      );
    });
  });
});
