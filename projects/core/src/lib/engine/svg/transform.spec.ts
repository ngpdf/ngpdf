import { describe, expect, it } from 'vitest';
import type { Matrix } from '../writer';
import { IDENTITY, multiply, parseTransform } from './transform';

function close(actual: Matrix | null, expected: Matrix): void {
  expect(actual).not.toBeNull();
  actual?.forEach((value, i) => {
    expect(value).toBeCloseTo(expected[i] ?? NaN, 9);
  });
}

describe('parseTransform', () => {
  it('reads each of the six functions', () => {
    close(parseTransform('matrix(1 2 3 4 5 6)'), [1, 2, 3, 4, 5, 6]);
    close(parseTransform('translate(10)'), [1, 0, 0, 1, 10, 0]);
    close(parseTransform('translate(10, 20)'), [1, 0, 0, 1, 10, 20]);
    close(parseTransform('scale(2)'), [2, 0, 0, 2, 0, 0]);
    close(parseTransform('scale(2 3)'), [2, 0, 0, 3, 0, 0]);
    close(parseTransform('rotate(90)'), [0, 1, -1, 0, 0, 0]);
    close(parseTransform('skewX(45)'), [1, 0, 1, 1, 0, 0]);
    close(parseTransform('skewY(45)'), [1, 1, 0, 1, 0, 0]);
  });

  it('rotates about a point', () => {
    // rotate(90, 10, 10) = translate(10 10) rotate(90) translate(-10 -10)
    close(parseTransform('rotate(90 10 10)'), [0, 1, -1, 0, 20, 0]);
  });

  it('applies a list from right to left', () => {
    // A point is scaled first, then moved.
    close(parseTransform('translate(10,0) scale(2)'), [2, 0, 0, 2, 10, 0]);
    close(parseTransform(' translate(10,0),scale(2) '), [2, 0, 0, 2, 10, 0]);
    close(parseTransform('scale(2)translate(10,0)'), [2, 0, 0, 2, 20, 0]);
  });

  it('takes the units of CSS transforms in a style', () => {
    close(parseTransform('translate(10px, 5px) rotate(90deg)'), [0, 1, -1, 0, 10, 5]);
  });

  it('is the identity for an empty list or none', () => {
    expect(parseTransform('')).toEqual(IDENTITY);
    expect(parseTransform('none')).toEqual(IDENTITY);
  });

  it.each([
    'translate(1 2 3)',
    'rotate(1 2)',
    'matrix(1 2 3)',
    'scale()',
    'spin(4)',
    'translate(1',
    'translate 1 2',
    'translate(1,)',
    'translate(a)',
    'scale(2),,scale(2)',
  ])('is null for %j', (text) => {
    expect(parseTransform(text)).toBeNull();
  });
});

describe('multiply', () => {
  it('applies the right matrix first', () => {
    close(multiply([1, 0, 0, 1, 10, 0], [2, 0, 0, 2, 0, 0]), [2, 0, 0, 2, 10, 0]);
  });
});
