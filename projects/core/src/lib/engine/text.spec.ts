import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ROOT_TEXT_STYLE, type TextStyle } from './style';
import { layoutText, measureText } from './text';
import { createPdfkitWriter, type FontMetrics, type PdfWriter } from './writer';

const MEASURE_MODE_UNDEFINED = 0;
const MEASURE_MODE_AT_MOST = 2;

const style: TextStyle = {
  ...ROOT_TEXT_STYLE,
  fontFamily: 'Helvetica',
  fontSize: 9,
  lineHeight: 1.5,
};

// "-b" kerns 6pt wider than the sum of its characters (real Helvetica has no such pair across a
// break opportunity), so "a-b" sums to 30pt but draws 36pt.
const kerningMetrics: FontMetrics = {
  widthOf: (text) => 10 * text.length + (text.includes('-b') ? 6 : 0),
  ascent: () => 0,
};

// About 80 ms a run on a developer machine, and up to 500 ms on a shared CI runner with coverage
// on. A quadratic regression over 100,000 characters takes far longer than either, so the budget
// only has to separate those two, not hold the runner to a laptop's speed.
const TEXT_BUDGET_MS = 2000;

describe('layoutText', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });

  it('wraps a name at word boundaries', () => {
    const block = layoutText('Gabriela Teixeira de Albuquerque Cavalcanti', style, 120, writer);
    expect(block.lines).toHaveLength(2);
    for (const line of block.lines) expect(line.width).toBeLessThanOrEqual(120);
    expect(block.lines.map((line) => line.text).join(' ')).toBe(
      'Gabriela Teixeira de Albuquerque Cavalcanti',
    );
  });

  it('positions lines by the line height and reports the block size', () => {
    const block = layoutText('Gabriela Teixeira de Albuquerque Cavalcanti', style, 120, writer);
    expect(block.lines.map((line) => line.y)).toEqual([0, 13.5]);
    expect(block.height).toBe(27);
    expect(block.width).toBe(Math.max(...block.lines.map((line) => line.width)));
  });

  it('collapses runs of whitespace into one space', () => {
    const block = layoutText('a   b\n c', style, 500, writer);
    expect(block.lines.map((line) => line.text)).toEqual(['a b c']);
  });

  it.each(['\f', '\v', '\u2028', '\u0085'])(
    'collapses requested whitespace characters',
    (whitespace) => {
      const block = layoutText(`a${whitespace}b`, style, 500, writer);
      expect(block.lines.map((line) => line.text)).toEqual(['a b']);
    },
  );

  it('trims whitespace at the ends of the text and of each line', () => {
    const block = layoutText('  hello \n world  ', style, 500, writer);
    expect(block.lines.map((line) => line.text)).toEqual(['hello world']);
    const narrow = layoutText('hello world', style, 30, writer);
    expect(narrow.lines.map((line) => line.text)).toEqual(['hello', 'world']);
  });

  it('does not break inside a time whose locale puts a narrow no-break space before PM', () => {
    const wide = layoutText('at 3:00 PM', style, 500, writer);
    const block = layoutText('at 3:00 PM', style, wide.width - 1, writer);
    expect(block.lines.map((line) => line.text)).toEqual(['at', '3:00 PM']);
  });

  it('draws a word with a soft hyphen without the hyphen', () => {
    const block = layoutText('co­operation', style, 500, writer);
    expect(block.lines.map((line) => line.text)).toEqual(['cooperation']);
    expect(block.width).toBe(writer.widthOf('cooperation', 'Helvetica', 9));
  });

  it('splits a long e-mail address that is wider than its box', () => {
    const block = layoutText('pessoa140@empresa-muito-longa.com.br', style, 60, writer);
    expect(block.lines.length).toBeGreaterThanOrEqual(2);
    for (const line of block.lines) expect(line.width).toBeLessThanOrEqual(60);
    expect(block.lines.map((line) => line.text).join('')).toBe(
      'pessoa140@empresa-muito-longa.com.br',
    );
  });

  it('splits a long word with no break opportunity at the last character that fits', () => {
    const block = layoutText('abcdefghijklmnopqrstuvwxyz', style, 40, writer);
    expect(block.lines.length).toBeGreaterThan(1);
    for (const line of block.lines) expect(line.width).toBeLessThanOrEqual(40);
    expect(block.lines.map((line) => line.text).join('')).toBe('abcdefghijklmnopqrstuvwxyz');
  });

  it('continues after a split word on the same line when the next word fits', () => {
    const block = layoutText('abcdefghijklmnopqrstuvwxyz ok', style, 100, writer);
    expect(block.lines.map((line) => line.text).join('')).toContain('abcdefghijklmnopqrstuvwxyz');
    expect(block.lines.at(-1)?.text.endsWith('ok')).toBe(true);
  });

  it('keeps a split chunk within the box when kerning widens the joined text', () => {
    // Summed per-character widths fit 12pt, but the drawn width of "_rt" at 10pt does not.
    const tenPoint = { ...ROOT_TEXT_STYLE, fontSize: 10 };
    const block = layoutText('_rt', tenPoint, 12, writer);
    for (const line of block.lines) {
      expect(writer.widthOf(line.text, 'Helvetica', 10)).toBeLessThanOrEqual(12);
      expect(line.width).toBeLessThanOrEqual(12);
    }
    expect(block.lines.map((line) => line.text).join('')).toBe('_rt');
  });

  it('never starts or ends a line with a space when a piece holds an inner space', () => {
    // No break is allowed between a space and a following full stop, so "ab ." is one piece.
    const tenPoint = { ...ROOT_TEXT_STYLE, fontSize: 10 };
    const block = layoutText('ab\t.', tenPoint, 12, writer);
    expect(block.lines.map((line) => line.text)).toEqual(['ab', '.']);
  });

  it('moves trailing words to the next line when the drawn width overflows', () => {
    const block = layoutText('a-b c', style, 30, kerningMetrics);
    expect(block.lines.map((line) => line.text)).toEqual(['a-', 'b c']);
    for (const line of block.lines) expect(line.width).toBeLessThanOrEqual(30);
  });

  it('keeps the words carried to the next line when the text ends there', () => {
    // "a-b" sums to 30pt but draws 36pt: "b" moves to a second line and is not dropped.
    const block = layoutText('a-b', style, 30, kerningMetrics);
    expect(block.lines.map((line) => line.text)).toEqual(['a-', 'b']);
  });

  it('still splits a word wider than the box after a line carried words over', () => {
    const block = layoutText('a-b cdefghij', style, 30, kerningMetrics);
    expect(block.lines.map((line) => line.text)).toEqual(['a-', 'b', 'cde', 'fgh', 'ij']);
    for (const line of block.lines) expect(line.width).toBeLessThanOrEqual(30);
  });

  it('lays out 100,000 characters in under 2000 ms when every measured line overflows its estimate', () => {
    // Every multi-character measure draws 25pt wider than the character sum, so each line
    // takes the narrowing path.
    const inflating: FontMetrics = {
      widthOf: (text) => 10 * text.length + (text.length > 1 ? 25 : 0),
      ascent: () => 0,
    };
    const text = 'ab-cd-ef '.repeat(11_112);
    const timings: number[] = [];
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      const block = layoutText(text, style, 300, inflating);
      timings.push(performance.now() - started);
      expect(block.lines.every((line) => line.width <= 300)).toBe(true);
      expect(
        block.lines
          .map((line) => line.text)
          .join('')
          .replace(/ /g, ''),
      ).toBe(text.replace(/ /g, ''));
    }
    expect(Math.min(...timings)).toBeLessThan(TEXT_BUDGET_MS);
  });

  it('splits a 100,000-character unbreakable word in under 2000 ms', () => {
    const word = 'x'.repeat(100_000);
    const timings: number[] = [];
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      const block = layoutText(word, style, 30, writer);
      timings.push(performance.now() - started);
      expect(block.lines.every((line) => line.width <= 30)).toBe(true);
    }
    expect(Math.min(...timings)).toBeLessThan(TEXT_BUDGET_MS);
  });

  it('puts one character per line when the box is narrower than a character', () => {
    const block = layoutText('abc', style, 1, writer);
    expect(block.lines.map((line) => line.text)).toEqual(['a', 'b', 'c']);
  });

  it('returns no lines and zero height for empty or blank text', () => {
    for (const text of ['', '   \n ']) {
      const block = layoutText(text, style, 100, writer);
      expect(block).toEqual({ lines: [], width: 0, height: 0 });
    }
  });

  it('puts everything on one line when the width is unbounded', () => {
    const block = layoutText('one two three four', style, Infinity, writer);
    expect(block.lines).toHaveLength(1);
    expect(block.width).toBeCloseTo(writer.widthOf('one two three four', 'Helvetica', 9), 6);
  });

  it('measures what will be drawn: unsupported characters become ? and warn', () => {
    const warn = vi.fn();
    const block = layoutText('a\u{1F600}b', style, 500, writer, warn);
    expect(block.lines.map((line) => line.text)).toEqual(['a?b']);
    expect(warn).toHaveBeenCalledExactlyOnceWith(['\u{1F600}']);
  });

  it('does not collapse a non-breaking space', () => {
    const block = layoutText('a  b', style, 500, writer);
    expect(block.lines.map((line) => line.text)).toEqual(['a  b']);
  });

  it('accepts text of exactly 1 MB and rejects one code unit more', () => {
    const limit = 1_048_576;
    expect(() => layoutText('a'.repeat(limit), style, Infinity, writer)).not.toThrow();
    expect(() => layoutText('a'.repeat(limit + 1), style, Infinity, writer)).toThrow(
      'ngpdf: text longer than 1 MB',
    );
  });
});

describe('measureText', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });
  const text = 'Gabriela Teixeira de Albuquerque Cavalcanti';

  it('returns the single-line size when the width mode is undefined', () => {
    const size = measureText(text, style, writer)(0, MEASURE_MODE_UNDEFINED);
    expect(size.width).toBeCloseTo(writer.widthOf(text, 'Helvetica', 9), 6);
    expect(size.height).toBe(13.5);
  });

  it('wraps at the given width', () => {
    const size = measureText(text, style, writer)(120, MEASURE_MODE_AT_MOST);
    expect(size.width).toBeLessThanOrEqual(120);
    expect(size.height).toBe(27);
  });

  it('measures empty text as zero by zero', () => {
    expect(measureText('', style, writer)(100, MEASURE_MODE_AT_MOST)).toEqual({
      width: 0,
      height: 0,
    });
  });

  it('rejects text over 1 MB when the measure function is created', () => {
    expect(() => measureText('a'.repeat(1_048_577), style, writer)).toThrow(
      'ngpdf: text longer than 1 MB',
    );
  });
});
