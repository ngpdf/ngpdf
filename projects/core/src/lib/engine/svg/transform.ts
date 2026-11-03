import type { Matrix, Point } from '../writer';
import { readNumber, skipSeparator, skipSpaces } from './number';

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m · n`: n is applied first. */
export function multiply(m: Matrix, n: Matrix): Matrix {
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

export function applyMatrix(m: Matrix, point: Point): Point {
  return { x: m[0] * point.x + m[2] * point.y + m[4], y: m[1] * point.x + m[3] * point.y + m[5] };
}

export function isIdentity(m: Matrix): boolean {
  return m.every((value, i) => value === IDENTITY[i]);
}

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** The matrix of one function and its arguments; null for a wrong name or argument count. */
function functionMatrix(name: string, args: readonly number[]): Matrix | null {
  const [p = 0, q, r] = args;
  const n = args.length;
  switch (name) {
    case 'matrix':
      return n === 6 ? (args as unknown as Matrix) : null;
    case 'translate':
      return n === 1 || n === 2 ? [1, 0, 0, 1, p, q ?? 0] : null;
    case 'scale':
      return n === 1 || n === 2 ? [p, 0, 0, q ?? p, 0, 0] : null;
    case 'rotate': {
      if (n !== 1 && n !== 3) return null;
      const [cos, sin] = [Math.cos(radians(p)), Math.sin(radians(p))];
      const rotation: Matrix = [cos, sin, -sin, cos, 0, 0];
      if (n === 1) return rotation;
      const [cx = 0, cy = 0] = [q, r];
      return multiply(multiply([1, 0, 0, 1, cx, cy], rotation), [1, 0, 0, 1, -cx, -cy]);
    }
    case 'skewX':
      return n === 1 ? [1, 0, Math.tan(radians(p)), 1, 0, 0] : null;
    case 'skewY':
      return n === 1 ? [1, Math.tan(radians(p)), 0, 1, 0, 0] : null;
    default:
      return null;
  }
}

/**
 * Parses an SVG transform list (`matrix`, `translate`, `scale`, `rotate`, `skewX`, `skewY`) into
 * one matrix, applied right to left as the list reads. `px` and `deg` after a number are read
 * too, so the CSS form a `style` gives works. Null when the list is invalid: SVG then draws the
 * element untransformed.
 */
export function parseTransform(text: string): Matrix | null {
  let matrix = IDENTITY;
  let at = skipSpaces(text, 0);
  if (text.slice(at).trimEnd() === 'none') return IDENTITY;
  while (at < text.length) {
    let end = at;
    while (end < text.length && /[a-z]/i.test(text[end] ?? '')) end++;
    const name = text.slice(at, end);
    at = skipSpaces(text, end);
    if (name === '' || text[at] !== '(') return null;
    at = skipSpaces(text, at + 1);
    const args: number[] = [];
    while (text[at] !== ')') {
      if (args.length > 0) at = skipSeparator(text, at);
      const read = readNumber(text, at);
      if (!read) return null;
      args.push(read.value);
      at = read.end;
      if (text.startsWith('px', at)) at += 2;
      else if (text.startsWith('deg', at)) at += 3;
      at = skipSpaces(text, at);
      if (at >= text.length) return null;
    }
    const step = functionMatrix(name, args);
    if (!step) return null;
    matrix = multiply(matrix, step);
    at = skipSeparator(text, at + 1);
  }
  return matrix;
}
