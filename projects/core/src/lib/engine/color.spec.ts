import { describe, expect, it } from 'vitest';
import { parseColor, toHex } from './color';

const rgb = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a });

describe('parseColor', () => {
  it('reads hex colors of 3, 4, 6 and 8 digits in any case', () => {
    expect(parseColor('#f00')).toEqual(rgb(255, 0, 0));
    expect(parseColor('#F008')).toEqual(rgb(255, 0, 0, 0x88 / 255));
    expect(parseColor('#DD0031')).toEqual(rgb(221, 0, 49));
    expect(parseColor('#ff000080')).toEqual(rgb(255, 0, 0, 0x80 / 255));
  });

  it('reads rgb() and rgba() with commas, spaces, percentages and a slash alpha', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual(rgb(255, 0, 0));
    expect(parseColor('rgb(255 128 0)')).toEqual(rgb(255, 128, 0));
    expect(parseColor('rgb(1\t2\n3)')).toEqual(rgb(1, 2, 3));
    expect(parseColor('rgba(0, 0, 255, 0.5)')).toEqual(rgb(0, 0, 255, 0.5));
    expect(parseColor('rgb(0 0 255 / 25%)')).toEqual(rgb(0, 0, 255, 0.25));
    expect(parseColor('rgb(100%, 50%, 0%)')).toEqual(rgb(255, 128, 0));
    expect(parseColor('RGBA( 10 , 20 , 30 , 40% )')).toEqual(rgb(10, 20, 30, 0.4));
    expect(parseColor('rgb(1.5, 2, 3)')).toEqual(rgb(2, 2, 3));
  });

  it('clamps channels and alpha to their ranges, as CSS does', () => {
    expect(parseColor('rgb(300, -5, 0)')).toEqual(rgb(255, 0, 0));
    expect(parseColor('rgba(0, 0, 0, 2)')).toEqual(rgb(0, 0, 0, 1));
    expect(parseColor('rgba(0, 0, 0, -1)')).toEqual(rgb(0, 0, 0, 0));
  });

  it('reads the CSS named colors in any case, and transparent', () => {
    expect(parseColor('Red')).toEqual(rgb(255, 0, 0));
    expect(parseColor('rebeccapurple')).toEqual(rgb(102, 51, 153));
    expect(parseColor('LightGoldenRodYellow')).toEqual(rgb(250, 250, 210));
    expect(parseColor('grey')).toEqual(parseColor('gray'));
    expect(parseColor(' transparent ')).toEqual(rgb(0, 0, 0, 0));
  });

  it.each([
    '',
    'notacolor',
    'currentcolor',
    '#12',
    '#12345',
    '#ggg',
    'rgb(1, 2)',
    'rgb(1, 2, 3',
    'rgb(1, 2, 3, 4, 5)',
    'rgb(a, b, c)',
    'rgb(1, 2, 3) x',
    'hsl(0, 100%, 50%)',
    'rgb(0x10, 0, 0)',
    'rgb(0b1 0 0)',
    'rgb(0o7, 0, 0)',
    'rgba(0, 0, 0, 0x1)',
    'rgb(0X10, 0, 0)',
    'rgb(0B1 0 0)',
    'rgb(0O7, 0, 0)',
    'rgba(0, 0, 0, 0X1)',
    'constructor',
  ])('throws on %j, naming the value and the element', (value) => {
    expect(() => parseColor(value, 'pdf-view')).toThrow(
      `ngpdf: invalid color "${value}" on pdf-view`,
    );
  });

  it('finishes in linear time on a long hostile value', () => {
    const value = `rgb(${'1 '.repeat(50_000)}`;
    const start = performance.now();
    expect(() => parseColor(value)).toThrow(/^ngpdf: invalid color/);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe('toHex', () => {
  it('writes the channels as #rrggbb', () => {
    expect(toHex(rgb(255, 0, 49))).toBe('#ff0031');
    expect(toHex(rgb(0, 0, 0, 0))).toBe('#000000');
  });
});
