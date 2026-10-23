import LineBreaker from 'linebreak';
import { fontFor, toWinAnsi } from './fonts';
import type { TextStyle } from './style';
import type { FontMetrics } from './writer';

export interface TextLine {
  readonly text: string;
  readonly width: number;
  /** Top of the line box. */
  readonly y: number;
}

export interface TextBlock {
  readonly lines: readonly TextLine[];
  readonly width: number;
  readonly height: number;
}

const MAX_TEXT_LENGTH = 1_048_576;
// yoga-layout's MeasureMode.Undefined: no width constraint.
const MEASURE_MODE_UNDEFINED = 0;
// How far over `maxWidth` the summed character widths may be and still be tried by measuring.
const KERNING_SLACK = 1.25;

function assertTextSize(text: string): void {
  if (text.length > MAX_TEXT_LENGTH) throw new Error('ngpdf: text longer than 1 MB');
}

/** CSS `white-space: normal`: runs of space, tab and line breaks become one space; ends trimmed. */
function collapseWhitespace(text: string): string {
  return text.replace(/[ \t\r\n\f\v\u2028\u0085]+/g, ' ').trim();
}

/** Positions in `text` after which a line may break (UAX #14); the last one is `text.length`. */
function breakPositions(text: string): number[] {
  const positions: number[] = [];
  const breaker = new LineBreaker(text);
  for (let next = breaker.nextBreak(); next; next = breaker.nextBreak()) {
    positions.push(next.position);
  }
  return positions;
}

/** The largest `index` in `[low, high]` where `holds(index)`, or `low - 1`; `holds` is monotone. */
function lastWhere(low: number, high: number, holds: (index: number) => boolean): number {
  let lo = low - 1;
  let hi = high;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (holds(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Breaks `text` into lines no wider than `maxWidth`, at Unicode line break opportunities. A word
 * wider than `maxWidth` is split at the last character that fits (at least one per line).
 *
 * Every line's drawn width, `widthOf(line.text)`, is at most `maxWidth`, unless a single character
 * is wider than `maxWidth`. Kerning makes the drawn width differ from the sum of the character
 * widths, so the sums (prefix sums, built once) only give a starting guess for each line's end, taken up
 * to 25% over `maxWidth` to allow for kerning that narrows the text;
 * the guess is then measured for real and, if it overflows, the end is found by binary search over
 * the candidate ends, measuring each candidate. A line is never given up without being measured.
 *
 * Cost: O(n) for the prefix sums and the break positions, then per line O(log n) steps for the
 * guess plus O(log k) measures of at most k characters (k is about one line), so O(n log k) in the
 * worst case. Every line takes at least one character, so no text is lost.
 */
export function layoutText(
  text: string,
  style: TextStyle,
  maxWidth: number,
  metrics: FontMetrics,
  warn: (chars: string[]) => void = () => undefined,
): TextBlock {
  assertTextSize(text);
  const collapsed = toWinAnsi(collapseWhitespace(text), warn);
  const font = fontFor(style);
  const size = style.fontSize;
  const lineHeight = size * style.lineHeight;
  const widthOf = (chunk: string): number => metrics.widthOf(chunk, font, size);

  const length = collapsed.length;
  // prefix[i] is the summed width of the first i characters (all single UTF-16 units after WinAnsi).
  const prefix = new Float64Array(length + 1);
  const charWidths = new Map<string, number>();
  for (let i = 0; i < length; i++) {
    const char = collapsed.charAt(i);
    let charWidth = charWidths.get(char);
    if (charWidth === undefined) {
      charWidth = widthOf(char);
      charWidths.set(char, charWidth);
    }
    prefix[i + 1] = (prefix[i] ?? 0) + charWidth;
  }
  const breaks = length === 0 ? [] : breakPositions(collapsed);

  /** The end of the text to draw for a line `[start, end)`: a trailing space is not drawn. */
  const drawnEnd = (end: number): number => (collapsed.charCodeAt(end - 1) === 32 ? end - 1 : end);
  const guess = (start: number, end: number): number =>
    (prefix[drawnEnd(end)] ?? 0) - (prefix[start] ?? 0);
  const measure = (start: number, end: number): number =>
    widthOf(collapsed.slice(start, drawnEnd(end)));
  const fits = (start: number, end: number): boolean => measure(start, end) <= maxWidth;

  /** The largest end in `[low, high]` that fits, given that `low` fits and `high` does not. */
  const narrow = (low: number, high: number, endOf: (index: number) => number, start: number) =>
    endOf(lastWhere(low, high - 1, (index) => fits(start, endOf(index))));

  // Kerning mostly narrows text, so a line can hold a little more than its character sum says.
  const guessLimit = maxWidth * KERNING_SLACK;

  const lines: TextLine[] = [];
  let start = 0;
  let nextBreak = 0;
  while (start < length) {
    // A piece can hold an inner space (no break before some punctuation): no line starts with one.
    if (collapsed.charCodeAt(start) === 32) {
      start++;
      continue;
    }
    while ((breaks[nextBreak] ?? length) <= start) nextBreak++;
    const firstEnd = breaks[nextBreak] ?? length;

    // Whole words: the last break whose summed width fits, checked and narrowed by measuring.
    const lastGuess = lastWhere(
      nextBreak,
      breaks.length - 1,
      (index) => guess(start, breaks[index] ?? length) <= guessLimit,
    );
    let end = -1;
    if (lastGuess >= nextBreak) {
      const guessEnd = breaks[lastGuess] ?? length;
      if (fits(start, guessEnd)) end = guessEnd;
      else if (fits(start, firstEnd))
        end = narrow(nextBreak, lastGuess, (i) => breaks[i] ?? length, start);
    }

    if (end < 0) {
      // The first word is wider than the box: split it at the last character that fits.
      const lastChar = lastWhere(start + 1, firstEnd, (index) => guess(start, index) <= guessLimit);
      const guessEnd = Math.max(lastChar, start + 1);
      if (fits(start, guessEnd) || guessEnd === start + 1) end = guessEnd;
      else if (fits(start, start + 1)) end = narrow(start + 1, guessEnd, (i) => i, start);
      else end = start + 1;
    }

    const lineText = collapsed.slice(start, drawnEnd(end));
    lines.push({ text: lineText, width: widthOf(lineText), y: lines.length * lineHeight });
    start = end;
  }

  return {
    lines,
    width: lines.reduce((widest, line) => Math.max(widest, line.width), 0),
    height: lines.length * lineHeight,
  };
}

/** A Yoga measure function (`node.setMeasureFunc`) for the text. */
export function measureText(
  text: string,
  style: TextStyle,
  metrics: FontMetrics,
): (width: number, widthMode: number) => { width: number; height: number } {
  assertTextSize(text);
  return (width, widthMode) => {
    const maxWidth = widthMode === MEASURE_MODE_UNDEFINED ? Infinity : width;
    const { width: blockWidth, height } = layoutText(text, style, maxWidth, metrics);
    return { width: blockWidth, height };
  };
}
