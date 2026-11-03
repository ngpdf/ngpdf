import { describe, expect, it, vi } from 'vitest';
import type { DrawOp } from '../writer';
import { compileSvg, MAX_USE_DEPTH, type SvgAsset } from './render';
import { MAX_SVG_ELEMENTS, parseXml } from './xml';

type ShapeOp = Extract<DrawOp, { op: 'shape' }>;

const RED = { r: 255, g: 0, b: 0, a: 1 };

function compile(markup: string, warn: (message: string) => void = () => undefined): SvgAsset {
  return compileSvg(parseXml(markup, warn), RED, warn);
}

const shapes = (asset: SvgAsset): ShapeOp[] =>
  asset.ops.filter((op): op is ShapeOp => op.op === 'shape');
const opKinds = (asset: SvgAsset): string[] => asset.ops.map((op) => op.op);

describe('compileSvg', () => {
  describe('size', () => {
    it('takes the root width and height in points', () => {
      expect(compile('<svg width="100" height="1in"/>')).toMatchObject({
        width: 100,
        height: 72,
        viewBox: { x: 0, y: 0, width: 100, height: 72 },
      });
    });

    it('follows the viewBox for a missing side, or for both', () => {
      expect(compile('<svg viewBox="0 0 20 10" width="40"/>')).toMatchObject({
        width: 40,
        height: 20,
      });
      expect(compile('<svg viewBox="0 0 20 10" height="40"/>')).toMatchObject({
        width: 80,
        height: 40,
      });
      expect(compile('<svg viewBox="5 5 20 10"/>')).toMatchObject({
        width: 20,
        height: 10,
        viewBox: { x: 5, y: 5, width: 20, height: 10 },
      });
    });

    it('falls back to 300 × 150, as browsers do, and reads percentages as missing', () => {
      expect(compile('<svg/>')).toMatchObject({ width: 300, height: 150 });
      expect(compile('<svg width="100%" height="50"/>')).toMatchObject({ width: 300, height: 50 });
      expect(compile('<svg width="50"/>')).toMatchObject({ width: 50, height: 150 });
    });

    it('draws nothing for an empty viewBox and ignores an invalid one with a warning', () => {
      expect(compile('<svg viewBox="0 0 0 10"><rect width="5" height="5"/></svg>').ops).toEqual([]);
      const warn = vi.fn();
      expect(compile('<svg viewBox="0 0 -1 10" width="10" height="10"/>', warn).viewBox).toEqual({
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
      expect(warn).toHaveBeenCalledWith(
        'ngpdf: pdf-svg ignored the invalid value "0 0 -1 10" for viewBox',
      );
    });

    it('reads preserveAspectRatio, warning on an invalid one', () => {
      expect(compile('<svg preserveAspectRatio="xMinYMax slice"/>').aspect).toEqual({
        align: { x: 0, y: 1 },
        slice: true,
      });
      expect(compile('<svg preserveAspectRatio="none"/>').aspect.align).toBeNull();
      const warn = vi.fn();
      expect(compile('<svg preserveAspectRatio="middle"/>', warn).aspect).toEqual({
        align: { x: 0.5, y: 0.5 },
        slice: false,
      });
      expect(warn).toHaveBeenCalledWith(
        'ngpdf: pdf-svg ignored the invalid value "middle" for preserveAspectRatio',
      );
    });
  });

  it('throws when the root is not an svg', () => {
    expect(() => compile('<html/>')).toThrow(
      'ngpdf: invalid SVG: the root element is <html>, not <svg> at 0',
    );
  });

  describe('painting', () => {
    it('fills black by default and strokes nothing', () => {
      const [shape] = shapes(compile('<svg><rect width="10" height="10"/></svg>'));
      expect(shape?.fill).toEqual({ color: '#000000', opacity: 1, rule: 'nonzero' });
      expect(shape?.stroke).toBeUndefined();
    });

    it('strokes with every line setting', () => {
      const [shape] = shapes(
        compile(
          '<svg><path d="M0 0 L10 0" fill="none" stroke="#0000ff" stroke-width="2" stroke-opacity="0.5" stroke-linecap="round" stroke-linejoin="bevel" stroke-miterlimit="8" stroke-dasharray="0 4" stroke-dashoffset="1"/></svg>',
        ),
      );
      expect(shape?.fill).toBeUndefined();
      expect(shape?.stroke).toEqual({
        color: '#0000ff',
        opacity: 0.5,
        width: 2,
        cap: 'round',
        join: 'bevel',
        miterLimit: 8,
        dash: { pattern: [0, 4], phase: 1 },
      });
    });

    it('paints currentColor with the inherited color', () => {
      const asset = compile(
        '<svg><rect width="1" height="1" fill="currentColor"/><g color="#00ff00"><rect width="1" height="1" fill="currentColor"/></g></svg>',
      );
      expect(shapes(asset).map((shape) => shape.fill?.color)).toEqual(['#ff0000', '#00ff00']);
    });

    it('leaves out a shape whose paints leave no ink', () => {
      const asset = compile(
        '<svg><rect width="1" height="1" fill="none"/><rect width="1" height="1" fill-opacity="0"/><rect width="1" height="1" fill="transparent"/><rect width="1" height="1" fill="none" stroke="red" stroke-width="0"/><line x2="5" stroke="none"/></svg>',
      );
      expect(asset.ops).toEqual([]);
    });

    it('never fills a line', () => {
      const [shape] = shapes(compile('<svg><line x2="5" stroke="red"/></svg>'));
      expect(shape?.fill).toBeUndefined();
      expect(shape?.stroke?.color).toBe('#ff0000');
    });

    it('leaves out a shape with numbers past what a float holds', () => {
      expect(compile('<svg><rect width="1e308" height="1e308" x="1e308"/></svg>').ops).toEqual([]);
    });
  });

  describe('structure', () => {
    it('wraps a transformed element in a transform', () => {
      const asset = compile(
        '<svg><g transform="translate(5 5)"><rect width="1" height="1"/></g></svg>',
      );
      expect(opKinds(asset)).toEqual(['transform', 'shape', 'untransform']);
      expect(asset.ops[0]).toEqual({ op: 'transform', matrix: [1, 0, 0, 1, 5, 5] });
    });

    it('draws a faded element as one group', () => {
      const asset = compile(
        '<svg opacity="0.5"><g opacity="0.4"><rect width="1" height="1"/><rect width="1" height="1"/></g></svg>',
      );
      expect(opKinds(asset)).toEqual(['group', 'group', 'shape', 'shape', 'ungroup', 'ungroup']);
      expect(asset.ops[1]).toEqual({ op: 'group', opacity: 0.4 });
    });

    it('leaves out wrappers that hold nothing', () => {
      expect(compile('<svg><g transform="scale(2)" opacity="0.5"><g/></g></svg>').ops).toEqual([]);
    });

    it('leaves out display none and opacity 0 with their children', () => {
      expect(
        compile(
          '<svg><g display="none"><rect width="1" height="1"/></g><rect width="1" height="1" style="display:none"/><rect width="1" height="1" opacity="0"/></svg>',
        ).ops,
      ).toEqual([]);
      expect(compile('<svg display="none"><rect width="1" height="1"/></svg>').ops).toEqual([]);
    });

    it('ignores an invalid transform with a warning', () => {
      const warn = vi.fn();
      const asset = compile('<svg><rect width="1" height="1" transform="spin(3)"/></svg>', warn);
      expect(opKinds(asset)).toEqual(['shape']);
      expect(warn).toHaveBeenCalledWith(
        'ngpdf: pdf-svg ignored the invalid value "spin(3)" for transform',
      );
    });

    it('places and clips a nested svg in its viewport', () => {
      const asset = compile(
        '<svg><svg x="10" y="20" width="40" height="20" viewBox="0 0 4 4"><rect width="4" height="4"/></svg></svg>',
      );
      expect(opKinds(asset)).toEqual([
        'transform',
        'clip',
        'transform',
        'shape',
        'untransform',
        'unclip',
        'untransform',
      ]);
      expect(asset.ops[0]).toEqual({ op: 'transform', matrix: [1, 0, 0, 1, 10, 20] });
      expect(asset.ops[1]).toMatchObject({ op: 'clip', x: 0, y: 0, w: 40, h: 20 });
      // xMidYMid meet: scaled by 5 and centred across.
      expect(asset.ops[2]).toEqual({ op: 'transform', matrix: [5, 0, 0, 5, 10, 0] });
    });

    it('sizes a nested svg without a viewBox to 100% and skips an empty one', () => {
      const asset = compile(
        '<svg viewBox="0 0 50 50"><svg><rect width="50%" height="1"/></svg></svg>',
      );
      expect(asset.ops[0]).toMatchObject({ op: 'clip', w: 50, h: 50 });
      expect(compile('<svg><svg width="0"><rect width="1" height="1"/></svg></svg>').ops).toEqual(
        [],
      );
      expect(
        compile('<svg><svg viewBox="0 0 0 1"><rect width="1" height="1"/></svg></svg>').ops,
      ).toEqual([]);
    });
  });

  describe('use', () => {
    it('draws the element it points at, moved by x and y, inheriting from the use', () => {
      const asset = compile(
        '<svg><defs><rect id="r" width="1" height="1"/></defs><use href="#r" x="5" fill="blue"/><use xlink:href="#r" y="2"/></svg>',
      );
      expect(opKinds(asset)).toEqual([
        'transform',
        'shape',
        'untransform',
        'transform',
        'shape',
        'untransform',
      ]);
      expect(asset.ops[0]).toEqual({ op: 'transform', matrix: [1, 0, 0, 1, 5, 0] });
      expect(shapes(asset)[0]?.fill?.color).toBe('#0000ff');
      expect(shapes(asset)[1]?.fill?.color).toBe('#000000');
    });

    it('skips an external reference, a missing id and a use with no href', () => {
      const warn = vi.fn();
      const asset = compile(
        '<svg><use href="http://example.com/x.svg#a"/><use href="#nope"/><use/></svg>',
        warn,
      );
      expect(asset.ops).toEqual([]);
      expect(warn.mock.calls).toEqual([
        ['ngpdf: pdf-svg skipped the external reference "http://example.com/x.svg#a"'],
        ['ngpdf: pdf-svg use points at "#nope", which is not in the file'],
      ]);
    });

    it(`throws past ${String(MAX_USE_DEPTH)} levels of use`, () => {
      const chain = (levels: number): string => {
        let defs = '<rect id="u0" width="1" height="1"/>';
        for (let i = 1; i <= levels; i++)
          defs += `<use id="u${String(i)}" href="#u${String(i - 1)}"/>`;
        return `<svg><defs>${defs}</defs><use href="#u${String(levels)}"/></svg>`;
      };
      expect(shapes(compile(chain(MAX_USE_DEPTH - 1)))).toHaveLength(1);
      expect(() => compile(chain(MAX_USE_DEPTH))).toThrow(
        `ngpdf: pdf-svg use nested deeper than ${String(MAX_USE_DEPTH)}`,
      );
    });

    it('throws on a use that points at itself or an ancestor', () => {
      expect(() => compile('<svg><use id="a" href="#a"/></svg>')).toThrow(
        'ngpdf: pdf-svg use nested deeper',
      );
      expect(() => compile('<svg><g id="g"><use href="#g"/></g></svg>')).toThrow(
        'ngpdf: pdf-svg use nested deeper',
      );
    });

    it('throws on a billion laughs of references before drawing them', () => {
      let defs = '<rect id="l0" width="1" height="1"/>';
      for (let i = 1; i <= 9; i++) {
        const refs = Array.from({ length: 10 }, () => `<use href="#l${String(i - 1)}"/>`).join('');
        defs += `<g id="l${String(i)}">${refs}</g>`;
      }
      const started = performance.now();
      expect(() => compile(`<svg><defs>${defs}</defs><use href="#l9"/></svg>`)).toThrow(
        `ngpdf: pdf-svg use expands to more than ${String(MAX_SVG_ELEMENTS)} elements`,
      );
      expect(performance.now() - started).toBeLessThan(2000);
    });
  });

  describe('skips what it does not draw', () => {
    it('warns once per element it does not draw', () => {
      const warn = vi.fn();
      const asset = compile(
        '<svg><text>Hi</text><image href="a.png"/><rect width="1" height="1"/><foreignObject/></svg>',
        warn,
      );
      expect(shapes(asset)).toHaveLength(1);
      expect(warn.mock.calls).toEqual([
        ['ngpdf: pdf-svg does not draw <text>'],
        ['ngpdf: pdf-svg does not draw <image>'],
        ['ngpdf: pdf-svg does not draw <foreignObject>'],
      ]);
    });

    it('skips scripts, style sheets and event attributes', () => {
      const warn = vi.fn();
      const asset = compile(
        '<svg onload="alert(1)"><script>alert(2)</script><style>rect { fill: red }</style><rect width="1" height="1" onclick="x()"/></svg>',
        warn,
      );
      expect(shapes(asset)[0]?.fill?.color).toBe('#000000');
      expect(warn.mock.calls).toEqual([
        ['ngpdf: pdf-svg skipped the event attribute "onload"'],
        ['ngpdf: pdf-svg skipped <script>'],
        ['ngpdf: pdf-svg does not draw <style> sheets'],
        ['ngpdf: pdf-svg skipped the event attribute "onclick"'],
      ]);
    });

    it('skips metadata and elements of other namespaces silently', () => {
      const warn = vi.fn();
      compile('<svg><title>t</title><desc/><metadata/><sodipodi:namedview/></svg>', warn);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('gradients', () => {
    const gradientOf = (asset: SvgAsset) => shapes(asset)[0]?.fill?.gradient;

    it('maps a linear gradient onto the bounding box by default', () => {
      const asset = compile(
        '<svg><linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="100%" stop-color="blue" stop-opacity="0.5"/></linearGradient><rect x="10" y="20" width="100" height="50" fill="url(#g)" fill-opacity="0.5"/></svg>',
      );
      const [shape] = shapes(asset);
      expect(shape?.fill).toMatchObject({ opacity: 1, rule: 'nonzero' });
      expect(gradientOf(asset)).toEqual({
        kind: 'linear',
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        stops: [
          { offset: 0, color: '#ff0000', opacity: 0.5 },
          { offset: 1, color: '#0000ff', opacity: 0.25 },
        ],
        matrix: [100, 0, 0, 50, 10, 20],
      });
    });

    it('reads user-space coordinates and the gradient transform', () => {
      const asset = compile(
        '<svg viewBox="0 0 200 100"><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="10%" x2="50" y2="20" gradientTransform="translate(5)"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><rect width="1" height="1" fill="url(#g)"/></svg>',
      );
      expect(gradientOf(asset)).toMatchObject({
        x1: 20,
        y1: 0,
        x2: 50,
        y2: 20,
        matrix: [1, 0, 0, 1, 5, 0],
      });
    });

    it('pads the stops to 0 and 1, clamps offsets and never lets them go back', () => {
      const asset = compile(
        '<svg><linearGradient id="g"><stop offset="0.2" stop-color="red"/><stop offset="0.1" stop-color="lime"/><stop offset="2" stop-color="blue"/><stop offset="x" stop-color="red"/></linearGradient><rect width="1" height="1" fill="url(#g)"/></svg>',
      );
      expect(gradientOf(asset)?.stops.map((stop) => stop.offset)).toEqual([0, 0.2, 0.2, 1, 1]);
    });

    it('draws a radial gradient with its focal point', () => {
      const asset = compile(
        '<svg><radialGradient id="g" fx="0.25" fr="10%"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></radialGradient><circle r="10" fill="url(#g)"/></svg>',
      );
      expect(gradientOf(asset)).toMatchObject({
        kind: 'radial',
        cx: 0.5,
        cy: 0.5,
        r1: 0.1,
        r2: 0.5,
        fx: 0.25,
        scaleY: 1,
        matrix: [20, 0, 0, 20, -10, -10],
      });
      expect(gradientOf(asset)).not.toHaveProperty('fy');
    });

    it('takes attributes and stops through href', () => {
      const asset = compile(
        '<svg><linearGradient id="base"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><linearGradient id="g" href="#base" x2="0" y2="1"/><linearGradient id="loop" xlink:href="#loop2"/><linearGradient id="loop2" href="#loop"/><rect width="1" height="1" fill="url(#g)"/><rect width="1" height="1" fill="url(#loop) lime"/></svg>',
      );
      expect(gradientOf(asset)).toMatchObject({ x2: 0, y2: 1 });
      expect(gradientOf(asset)?.stops).toHaveLength(2);
      // No stops anywhere in the chain paints nothing, not the fallback.
      expect(shapes(asset)).toHaveLength(1);
    });

    it('paints one color for one stop or no length, and the fallback for no gradient', () => {
      const asset = compile(
        '<svg><linearGradient id="one"><stop stop-color="blue" stop-opacity="0.5"/></linearGradient><linearGradient id="flat" x2="0"><stop stop-color="red"/><stop offset="1" stop-color="lime"/></linearGradient><radialGradient id="dot" r="0"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></radialGradient><radialGradient id="neg" r="-1"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></radialGradient><rect id="notone" width="1" height="1"/><rect width="1" height="1" fill="url(#one)"/><rect width="1" height="1" fill="url(#flat)"/><rect width="1" height="1" fill="url(#dot)"/><rect width="1" height="1" fill="url(#neg)"/><rect width="1" height="1" fill="url(#notone) #123456"/><rect width="1" height="1" fill="url(#missing)"/></svg>',
      );
      expect(
        shapes(asset)
          .slice(1)
          .map((shape) => [shape.fill?.color, shape.fill?.opacity]),
      ).toEqual([
        ['#0000ff', 0.5],
        ['#00ff00', 1],
        ['#0000ff', 1],
        ['#123456', 1],
      ]);
    });

    it('paints nothing on a box with no height in bounding box units', () => {
      const asset = compile(
        '<svg><linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><line x2="10" stroke="url(#g)"/></svg>',
      );
      expect(asset.ops).toEqual([]);
    });

    it('strokes with a gradient', () => {
      const asset = compile(
        '<svg><linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><rect width="10" height="10" fill="none" stroke="url(#g)"/></svg>',
      );
      expect(shapes(asset)[0]?.stroke?.gradient?.kind).toBe('linear');
    });

    it('warns about spread methods other than pad and invalid transforms', () => {
      const warn = vi.fn();
      compile(
        '<svg><linearGradient id="g" spreadMethod="reflect" gradientTransform="nope"><stop stop-color="red"/><stop offset="1" stop-color="currentColor"/></linearGradient><rect width="1" height="1" fill="url(#g)"/></svg>',
        warn,
      );
      expect(warn.mock.calls).toEqual([
        ['ngpdf: pdf-svg does not support spreadMethod="reflect"; drawn as pad'],
        ['ngpdf: pdf-svg ignored the invalid value "nope" for gradientTransform'],
      ]);
    });

    it('skips an external gradient href', () => {
      const warn = vi.fn();
      compile(
        '<svg><linearGradient id="g" href="other.svg#x"/><rect width="1" height="1" fill="url(#g) red"/></svg>',
        warn,
      );
      expect(warn).toHaveBeenCalledWith(
        'ngpdf: pdf-svg skipped the external reference "other.svg#x"',
      );
    });
  });
});
