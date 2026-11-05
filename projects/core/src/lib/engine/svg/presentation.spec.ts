import { describe, expect, it, vi } from 'vitest';
import { computeStyle, initialStyle, parseLength, type SvgStyle } from './presentation';
import { parseXml } from './xml';

const RED = { r: 255, g: 0, b: 0, a: 1 };
const VIEWPORT = { width: 100, height: 100 };

function styleOf(
  markup: string,
  parent: SvgStyle = initialStyle(RED),
  warn: (message: string) => void = () => undefined,
): SvgStyle {
  return computeStyle(parseXml(markup, warn), parent, VIEWPORT, warn);
}

describe('parseLength', () => {
  it('reads user units, ngpdf units and percentages', () => {
    expect(parseLength('12', 50)).toBe(12);
    expect(parseLength(' 12px ', 50)).toBe(12);
    expect(parseLength('1in', 50)).toBe(72);
    expect(parseLength('2pc', 50)).toBe(24);
    expect(parseLength('2.54cm', 50)).toBeCloseTo(72);
    expect(parseLength('25.4mm', 50)).toBeCloseTo(72);
    expect(parseLength('10%', 50)).toBe(5);
    expect(parseLength('1em', 50)).toBeNull();
    expect(parseLength('x', 50)).toBeNull();
  });
});

describe('computeStyle', () => {
  it('starts from the initial values and the pdf-svg color', () => {
    const style = styleOf('<g/>');
    expect(style.fill).toEqual({ kind: 'color', color: { r: 0, g: 0, b: 0, a: 1 } });
    expect(style.stroke).toEqual({ kind: 'none' });
    expect(style.color).toEqual(RED);
    expect(style.strokeWidth).toBe(1);
    expect(style.miterLimit).toBe(4);
  });

  it('reads presentation attributes', () => {
    const style = styleOf(
      '<g fill="#00f" fill-opacity="0.5" fill-rule="evenodd" stroke="currentColor" stroke-width="2" stroke-opacity="50%" stroke-linecap="round" stroke-linejoin="bevel" stroke-miterlimit="10" stroke-dasharray="1 2 3" stroke-dashoffset="1" opacity="0.3"/>',
    );
    expect(style).toMatchObject({
      fill: { kind: 'color', color: { r: 0, g: 0, b: 255, a: 1 } },
      fillOpacity: 0.5,
      fillRule: 'evenodd',
      stroke: { kind: 'current' },
      strokeWidth: 2,
      strokeOpacity: 0.5,
      lineCap: 'round',
      lineJoin: 'bevel',
      miterLimit: 10,
      dashArray: [1, 2, 3, 1, 2, 3],
      dashOffset: 1,
      opacity: 0.3,
    });
  });

  it('lets the style attribute win over presentation attributes', () => {
    const style = styleOf(
      '<g style="fill: blue !important; /* a comment */ stroke:red;;bad; :x" fill="green"/>',
    );
    expect(style.fill).toEqual({ kind: 'color', color: { r: 0, g: 0, b: 255, a: 1 } });
    expect(style.stroke).toEqual({ kind: 'color', color: RED });
  });

  it('inherits the inherited properties and resets the others', () => {
    const parent = styleOf('<g fill="blue" opacity="0.5" display="none" transform="scale(2)"/>');
    const child = styleOf('<g/>', parent);
    expect(child.fill).toEqual(parent.fill);
    expect(child.opacity).toBe(1);
    expect(child.display).toBe(true);
    expect(child.transform).toBeNull();
  });

  it('takes the parent value for inherit', () => {
    const parent = styleOf('<g fill="blue" stroke-width="3" opacity="0.5"/>');
    const child = styleOf(
      '<g fill="red" stroke-width="inherit" style="fill: inherit" opacity="inherit"/>',
      parent,
    );
    expect(child.fill).toEqual(parent.fill);
    expect(child.strokeWidth).toBe(3);
    expect(child.opacity).toBe(0.5);
  });

  it('resolves currentColor in color to the parent color', () => {
    expect(styleOf('<g color="currentColor"/>').color).toEqual(RED);
    expect(styleOf('<g color="blue"/>').color).toEqual({ r: 0, g: 0, b: 255, a: 1 });
  });

  it('reads gradient references, with a fallback', () => {
    expect(styleOf(`<g fill="url(#a)" stroke="url('#b') red"/>`)).toMatchObject({
      fill: { kind: 'url', id: 'a', fallback: null },
      stroke: { kind: 'url', id: 'b', fallback: { kind: 'color', color: RED } },
    });
  });

  it('skips an external reference, painting its fallback', () => {
    const warn = vi.fn();
    const style = styleOf(
      '<g fill="url(http://example.com/a.svg#g) blue" stroke="url(other.svg#x)"/>',
      undefined,
      warn,
    );
    expect(style.fill).toEqual({ kind: 'color', color: { r: 0, g: 0, b: 255, a: 1 } });
    expect(style.stroke).toEqual({ kind: 'none' });
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: pdf-svg skipped the external reference "http://example.com/a.svg#g"',
    );
  });

  it('makes a dash array of zeros solid and none solid', () => {
    expect(styleOf('<g stroke-dasharray="0 0"/>').dashArray).toBeNull();
    expect(styleOf('<g stroke-dasharray="none"/>').dashArray).toBeNull();
    expect(styleOf('<g stroke-dasharray="10%, 5"/>').dashArray).toEqual([10, 5]);
  });

  it('ignores an invalid value with a warning, keeping the inherited one', () => {
    const warn = vi.fn();
    const parent = styleOf('<g fill="blue" stroke-width="2"/>');
    const style = styleOf(
      '<g fill="nonsense" stroke-width="-1" stroke-linecap="pointy" opacity="x" stroke-miterlimit="0.5" stroke-dasharray="1 -2" stroke="url(#a) url(#b)" color="what" stop-color="nope" stroke-dashoffset="1em" fill-rule="odd"/>',
      parent,
      warn,
    );
    expect(style.fill).toEqual(parent.fill);
    expect(style.strokeWidth).toBe(2);
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: pdf-svg ignored the invalid value "nonsense" for fill',
    );
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: pdf-svg ignored the invalid value "-1" for stroke-width',
    );
    expect(warn).toHaveBeenCalledTimes(11);
  });

  it('rejects a url() fallback without recursing into a long run of them', () => {
    const warn = vi.fn();
    const style = styleOf(`<g fill="${'url(#a) '.repeat(30_000)}"/>`, undefined, warn);
    expect(style.fill.kind).toBe('color');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('ignores a url() with no closing parenthesis', () => {
    const warn = vi.fn();
    expect(styleOf('<g style="fill: url(#a"/>', undefined, warn).fill.kind).toBe('color');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('warns once per feature it does not draw', () => {
    const warn = vi.fn();
    styleOf(
      '<g clip-path="url(#c)" mask="none" filter="url(#f)" style="marker-end: url(#m)"/>',
      undefined,
      warn,
    );
    expect(warn.mock.calls).toEqual([
      ['ngpdf: pdf-svg does not support clip-path'],
      ['ngpdf: pdf-svg does not support filter'],
      ['ngpdf: pdf-svg does not support marker-end'],
    ]);
  });

  it('reads display none and a transform from the style over the attribute', () => {
    const style = styleOf('<g display="none" transform="scale(2)" style="transform: scale(3)"/>');
    expect(style.display).toBe(false);
    expect(style.transform).toBe('scale(3)');
  });

  it('reads stop colors', () => {
    expect(styleOf('<stop stop-color="currentColor" stop-opacity="0.4"/>')).toMatchObject({
      stopColor: 'current',
      stopOpacity: 0.4,
    });
  });
});
