const isDigit = (code: number): boolean => code >= 0x30 && code <= 0x39;

const isSpace = (code: number): boolean =>
  code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d || code === 0x0c;

export function skipSpaces(text: string, at: number): number {
  while (at < text.length && isSpace(text.charCodeAt(at))) at++;
  return at;
}

/** Spaces, at most one comma, and spaces again: what separates the numbers of a list. */
export function skipSeparator(text: string, at: number): number {
  at = skipSpaces(text, at);
  if (text.charCodeAt(at) === 0x2c) at = skipSpaces(text, at + 1);
  return at;
}

function digitsEnd(text: string, at: number): number {
  while (at < text.length && isDigit(text.charCodeAt(at))) at++;
  return at;
}

/**
 * The SVG number at `at` (`[+-]? (digits [. digits?] | . digits) ([eE] [+-]? digits)?`) and where
 * it ends, or null when none starts there or it is not finite. One scan, no regex.
 */
export function readNumber(text: string, at: number): { value: number; end: number } | null {
  let end = at;
  const sign = text.charCodeAt(end);
  if (sign === 0x2b || sign === 0x2d) end++;
  const whole = digitsEnd(text, end);
  let fraction = whole;
  if (text.charCodeAt(whole) === 0x2e) fraction = digitsEnd(text, whole + 1);
  if (whole === end && fraction <= whole + 1) return null;
  end = fraction;
  const e = text.charCodeAt(end);
  if (e === 0x65 || e === 0x45) {
    let exponent = end + 1;
    const expSign = text.charCodeAt(exponent);
    if (expSign === 0x2b || expSign === 0x2d) exponent++;
    const digits = digitsEnd(text, exponent);
    if (digits > exponent) end = digits;
  }
  const value = Number(text.slice(at, end));
  return Number.isFinite(value) ? { value, end } : null;
}

/**
 * A list of numbers separated by spaces or commas, as `points`, `viewBox` and `stroke-dasharray`
 * take; null when anything else is in it.
 */
export function parseNumberList(text: string): number[] | null {
  const numbers: number[] = [];
  let at = skipSpaces(text, 0);
  while (at < text.length) {
    const read = readNumber(text, at);
    if (!read) return null;
    numbers.push(read.value);
    at = skipSeparator(text, read.end);
    if (at >= text.length && text.charCodeAt(skipSpaces(text, read.end)) === 0x2c) return null;
  }
  return numbers;
}
