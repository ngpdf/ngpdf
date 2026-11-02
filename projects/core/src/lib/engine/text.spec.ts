import { beforeAll, describe, expect, it, vi } from 'vitest';
import { graphemeCount } from './graphemes';
import { ROOT_TEXT_STYLE, type TextStyle } from './style';
import {
  layoutRanges,
  layoutText,
  measureText,
  TextMeasureCache,
  type ParagraphStyle,
  type TextRange,
} from './text';
import { testFont } from '../../testing/test-fonts';
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
  hasGlyph: () => false,
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

  it('marks only the last line of the paragraph as last', () => {
    const block = layoutText('Gabriela Teixeira de Albuquerque Cavalcanti', style, 120, writer);
    expect(block.lines.map((line) => line.last)).toEqual([false, true]);
    expect(layoutText('Ana', style, 120, writer).lines.map((line) => line.last)).toEqual([true]);
  });

  it('collapses runs of whitespace into one space', () => {
    const block = layoutText('a   b\n c', style, 500, writer);
    expect(block.lines.map((line) => line.text)).toEqual(['a b c']);
  });

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
      hasGlyph: () => false,
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

  it('treats each whitespace character trim() strips as whitespace, not as ?', () => {
    for (const space of ['\v', '\f', '\u1680', '\u2028', '\u2029', '\u3000', '\uFEFF']) {
      expect(layoutText(space, style, 500, writer).lines).toEqual([]);
      expect(layoutText(`${space}a${space}`, style, 500, writer).lines.map((l) => l.text)).toEqual([
        'a',
      ]);
    }
  });

  it('collapses form feed, vertical tab, U+2028, U+2029 and U+0085 with the spaces around them', () => {
    for (const control of ['\f', '\v', '\u2028', '\u2029', '\u0085']) {
      const block = layoutText(`a ${control}${control} b${control}c`, style, 500, writer);
      expect(block.lines.map((line) => line.text)).toEqual(['a b c']);
    }
  });

  it('does not collapse a non-breaking space', () => {
    const block = layoutText('a  b', style, 500, writer);
    expect(block.lines.map((line) => line.text)).toEqual(['a  b']);
  });

  it('keeps a leading and trailing no-break space at paragraph edges', () => {
    const nbsp = '\u00a0';
    const leading = layoutText(`${nbsp}${nbsp}Indented`, style, 500, writer);
    expect(leading.lines.map((line) => line.text)).toEqual([`${nbsp}${nbsp}Indented`]);
    const trailing = layoutText(`Keep${nbsp}`, style, 500, writer);
    expect(trailing.lines.map((line) => line.text)).toEqual([`Keep${nbsp}`]);
  });

  it('keeps a leading figure space after it is rewritten to U+00A0', () => {
    // fonts.normalizeText turns U+2007 into U+00A0 before collapseWhitespace runs.
    const block = layoutText('\u20077', style, 500, writer);
    expect(block.lines.map((line) => line.text)).toEqual(['\u00a07']);
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

describe('TextMeasureCache', () => {
  /** Real widths, with every call counted. */
  function countingMetrics(writer: PdfWriter): FontMetrics & { calls: number } {
    const counted = {
      calls: 0,
      widthOf: (chunk: string, font: Parameters<FontMetrics['widthOf']>[1], size: number) => {
        counted.calls++;
        return writer.widthOf(chunk, font, size);
      },
      ascent: (font: Parameters<FontMetrics['ascent']>[0], size: number) =>
        writer.ascent(font, size),
      hasGlyph: (font: Parameters<FontMetrics['hasGlyph']>[0], codePoint: number) =>
        writer.hasGlyph(font, codePoint),
    };
    return counted;
  }

  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });
  const text = 'Gabriela Teixeira de Albuquerque Cavalcanti';

  it('lays out the same text at the same width once, and returns the same block', () => {
    const metrics = countingMetrics(writer);
    const cache = new TextMeasureCache();
    const first = layoutText(text, style, 120, metrics, undefined, cache);
    const calls = metrics.calls;
    expect(layoutText(text, style, 120, metrics, undefined, cache)).toBe(first);
    expect(metrics.calls).toBe(calls);
    // Without a shared cache the work is done again.
    layoutText(text, style, 120, metrics);
    expect(metrics.calls).toBeGreaterThan(calls);
  });

  it('measures each string once per font and size, across widths', () => {
    const metrics = countingMetrics(writer);
    const cache = new TextMeasureCache();
    const measure = measureText(text, style, metrics, cache);
    measure(120, MEASURE_MODE_AT_MOST);
    const calls = metrics.calls;
    // A narrower width breaks the same words again: only new candidate lines are measured.
    measure(80, MEASURE_MODE_AT_MOST);
    const narrower = metrics.calls - calls;
    measure(80, MEASURE_MODE_AT_MOST);
    expect(metrics.calls - calls).toBe(narrower);
    const fresh = countingMetrics(writer);
    measureText(text, style, fresh)(80, MEASURE_MODE_AT_MOST);
    expect(narrower).toBeLessThan(fresh.calls);
  });

  it('keeps widths, fonts, sizes and line heights apart, and matches an uncached layout', () => {
    const cache = new TextMeasureCache();
    const variants: [TextStyle, number][] = [
      [style, 120],
      [style, 80],
      [{ ...style, fontFamily: 'Courier' }, 120],
      [{ ...style, fontSize: 12 }, 120],
      [{ ...style, lineHeight: 2 }, 120],
    ];
    for (const [variant, width] of variants) {
      expect(layoutText(text, variant, width, writer, undefined, cache)).toEqual(
        layoutText(text, variant, width, writer),
      );
    }
  });

  it('reports replaced characters every time a cached block is used', () => {
    const cache = new TextMeasureCache();
    // Measuring has no warning sink; the final layout of the same text and width must still warn.
    measureText('Olá 漢', style, writer, cache)(Infinity, MEASURE_MODE_UNDEFINED);
    const warn = vi.fn();
    layoutText('Olá 漢', style, Infinity, writer, warn, cache);
    layoutText('Olá 漢', style, Infinity, writer, warn, cache);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(['漢']);
  });
});

describe('layoutText with custom fonts', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
    writer.registerFont('font:0', testFont('noto-sans-regular.ttf'));
    writer.registerFont('font:1', testFont('noto-sans-jp-subset.ttf'));
  });
  const fonts = { chain: ['font:0', 'font:1', 'Helvetica'] as const };

  it('measures text in the custom font, without the WinAnsi replacement', () => {
    const warn = vi.fn();
    const block = layoutText('Łódź Жук', style, Infinity, writer, warn, undefined, fonts);
    expect(block.lines.map((line) => line.text)).toEqual(['Łódź Жук']);
    expect(block.width).toBeCloseTo(writer.widthOf('Łódź Жук', 'font:0', 9), 6);
    expect(warn).not.toHaveBeenCalled();
  });

  it('draws ideographic spaces in a custom font that has them, without collapsing them', () => {
    // The Japanese test subset has no U+3000, so these metrics give it one.
    const metrics: FontMetrics = {
      widthOf: (chunk, font, size) => writer.widthOf(chunk, font, size),
      ascent: (font, size) => writer.ascent(font, size),
      hasGlyph: (font, codePoint) =>
        (font === 'font:1' && codePoint === 0x3000) || writer.hasGlyph(font, codePoint),
    };
    const missing = vi.fn();
    const text = '日\u3000\u3000本';
    const block = layoutText(text, style, Infinity, metrics, undefined, undefined, {
      ...fonts,
      missing,
    });
    expect(block.lines[0]?.runs.map((run) => [run.text, run.font])).toEqual([[text, 'font:1']]);
    expect(missing).not.toHaveBeenCalled();
  });

  it('gives each line its runs, one per font, placed one after another', () => {
    const block = layoutText('Zoë 日本語 ok', style, Infinity, writer, undefined, undefined, fonts);
    const [line] = block.lines;
    expect(line?.runs.map((run) => [run.text, run.font])).toEqual([
      ['Zoë ', 'font:0'],
      ['日本語 ', 'font:1'],
      ['ok', 'font:0'],
    ]);
    const [a, b, c] = line!.runs;
    expect(a!.x).toBe(0);
    expect(b!.x).toBeCloseTo(a!.width, 6);
    expect(c!.x).toBeCloseTo(a!.width + b!.width, 6);
    expect(line!.width).toBeCloseTo(a!.width + b!.width + c!.width, 6);
    expect(b!.width).toBeCloseTo(writer.widthOf('日本語 ', 'font:1', 9), 6);
  });

  it('wraps mixed-font text within the box', () => {
    const text = '日本語の文字 Тестовый текст 日本語 Zoë Łódź';
    const block = layoutText(text, style, 60, writer, undefined, undefined, fonts);
    expect(block.lines.length).toBeGreaterThan(2);
    for (const line of block.lines) expect(line.width).toBeLessThanOrEqual(60);
    expect(
      block.lines
        .map((line) => line.text)
        .join('')
        .replace(/ /g, ''),
    ).toBe(text.replace(/ /g, ''));
  });

  it('never splits a grapheme cluster when it breaks a word at the box edge', () => {
    // Decomposed é (e + U+0301) repeated: each line must end after an accent, never before it.
    const word = 'e\u0301'.repeat(30);
    const block = layoutText(word, style, 20, writer, undefined, undefined, fonts);
    expect(block.lines.length).toBeGreaterThan(1);
    for (const line of block.lines) {
      expect(line.text.length % 2).toBe(0);
      expect(line.text.startsWith('\u0301')).toBe(false);
    }
  });

  it('reports characters no font has as missing, not as replaced', () => {
    const warn = vi.fn();
    const missing = vi.fn();
    layoutText('a ☃', style, Infinity, writer, warn, undefined, { ...fonts, missing });
    expect(missing).toHaveBeenCalledWith(['☃']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('caches blocks per font chain', () => {
    const cache = new TextMeasureCache();
    const custom = layoutText('Zoë', style, Infinity, writer, undefined, cache, fonts);
    const standard = layoutText('Zoë', style, Infinity, writer, undefined, cache);
    expect(custom.lines[0]?.runs[0]?.font).toBe('font:0');
    expect(standard.lines[0]?.runs[0]?.font).toBe('Helvetica');
  });
});

describe('layoutRanges', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
    writer.registerFont('font:0', testFont('noto-sans-regular.ttf'));
  });
  const bold: TextStyle = { ...style, fontWeight: 'bold' };
  const red: TextStyle = { ...style, color: { r: 255, g: 0, b: 0, a: 1 } };
  const big: TextStyle = { ...style, fontSize: 18 };
  const range = (text: string, rangeStyle: TextStyle = style): TextRange => ({
    text,
    style: rangeStyle,
  });
  const lay = (ranges: readonly TextRange[], maxWidth = Infinity, warn?: (c: string[]) => void) =>
    layoutRanges(ranges, style, maxWidth, writer, warn);

  it('lays out one range exactly as layoutText does', () => {
    const text = 'Gabriela Teixeira de Albuquerque Cavalcanti';
    expect(lay([range(text)], 120)).toEqual(layoutText(text, style, 120, writer));
  });

  it('draws each range in its own font, size, color and decoration', () => {
    const underlined: TextStyle = { ...style, textDecoration: 'underline' };
    const [line] = lay([
      range('Total: '),
      range('42', bold),
      range(' ok', red),
      range('!', underlined),
    ]).lines;
    expect(line?.text).toBe('Total: 42 ok!');
    expect(
      line?.runs.map(({ text, font, color, decoration }) => [text, font, color.r, decoration]),
    ).toEqual([
      ['Total: ', 'Helvetica', 0, 'none'],
      ['42', 'Helvetica-Bold', 0, 'none'],
      [' ok', 'Helvetica', 255, 'none'],
      ['!', 'Helvetica', 0, 'underline'],
    ]);
    const runs = line?.runs ?? [];
    expect(runs[1]?.x).toBeCloseTo(writer.widthOf('Total: ', 'Helvetica', 9), 6);
    expect(runs[1]?.width).toBeCloseTo(writer.widthOf('42', 'Helvetica-Bold', 9), 6);
  });

  it('merges neighbouring ranges that draw alike into one run', () => {
    const [line] = lay([range('a '), range('b')]).lines;
    expect(line?.runs.map((run) => run.text)).toEqual(['a b']);
  });

  it('collapses whitespace across range boundaries and trims the paragraph ends', () => {
    const block = lay([range('  a  '), range('  b', bold), range('   '), range(' c  ')]);
    expect(block.lines.map((line) => line.text)).toEqual(['a b c']);
    expect(block.lines[0]?.runs.map((run) => run.text)).toEqual(['a ', 'b', ' c']);
  });

  it('drops ranges that are empty after collapsing', () => {
    const block = lay([range(''), range('   ', bold), range('x')]);
    expect(block.lines[0]?.runs.map((run) => [run.text, run.font])).toEqual([['x', 'Helvetica']]);
  });

  it('returns no lines for ranges that are only whitespace', () => {
    expect(lay([range(' ', bold), range('\n')])).toEqual({ lines: [], width: 0, height: 0 });
  });

  it('breaks at the paragraph’s break opportunities, not at range boundaries', () => {
    // "bold," has no break before the comma, so the comma follows the bold word to the next line.
    const width =
      writer.widthOf('aaaa ', 'Helvetica', 9) + writer.widthOf('bold', 'Helvetica-Bold', 9) + 1;
    const block = lay([range('aaaa '), range('bold', bold), range(', tail')], width);
    expect(block.lines.map((line) => line.text)).toEqual(['aaaa', 'bold, tail']);
  });

  it('measures a word that crosses a range boundary as the sum of its pieces', () => {
    const block = lay([range('ab'), range('cd', bold)]);
    expect(block.width).toBeCloseTo(
      writer.widthOf('ab', 'Helvetica', 9) + writer.widthOf('cd', 'Helvetica-Bold', 9),
      6,
    );
  });

  it('makes a line as tall as its largest run and puts the runs on one baseline', () => {
    const width =
      writer.widthOf('small ', 'Helvetica', 9) + writer.widthOf('BIG', 'Helvetica', 18) + 1;
    const block = lay([range('small '), range('BIG', big), range(' after and more words')], width);
    const [first, second] = block.lines;
    expect(first?.height).toBe(18 * 1.5);
    expect(first?.ascent).toBeCloseTo(writer.ascent('Helvetica', 18), 6);
    expect(first?.runs.map((run) => run.size)).toEqual([9, 18]);
    expect(first?.runs[0]?.ascent).toBeCloseTo(writer.ascent('Helvetica', 9), 6);
    expect(second?.y).toBe(27);
    expect(second?.height).toBe(13.5);
    expect(block.height).toBe(27 + 13.5 * block.lines.slice(1).length);
  });

  it('shapes each range with its own font chain', () => {
    const [line] = lay([
      range('Łódź '),
      { text: 'Łódź', style, fonts: { chain: ['font:0', 'Helvetica'] } },
    ]).lines;
    expect(line?.runs.map((run) => [run.text, run.font])).toEqual([
      ['?ód? ', 'Helvetica'],
      ['Łódź', 'font:0'],
    ]);
  });

  it('reports replaced characters from every range once', () => {
    const warn = vi.fn();
    lay([range('\u{1F600}'), range('b\u{1F600}', bold)], Infinity, warn);
    expect(warn).toHaveBeenCalledExactlyOnceWith(['\u{1F600}']);
  });

  it('does not reuse a cached block for the same text in another color', () => {
    const cache = new TextMeasureCache();
    const black = layoutRanges([range('same')], style, Infinity, writer, undefined, cache);
    const colored = layoutRanges([range('same', red)], style, Infinity, writer, undefined, cache);
    expect(black.lines[0]?.runs[0]?.color.r).toBe(0);
    expect(colored.lines[0]?.runs[0]?.color.r).toBe(255);
  });

  it('keeps the link of a range on its runs, split where the link starts and ends', () => {
    const url = 'https://example.com/';
    const [line] = lay([
      range('See '),
      { text: 'the ', style, link: url },
      { text: 'docs', style: bold, link: url },
      { text: ' and ', style },
      { text: 'more', style, link: 'mailto:a@example.com' },
    ]).lines;
    expect(line?.runs.map((run) => [run.text, run.link])).toEqual([
      ['See ', undefined],
      ['the ', url],
      ['docs', url],
      [' and ', undefined],
      ['more', 'mailto:a@example.com'],
    ]);
    expect(line?.runs[0]).not.toHaveProperty('link');
  });

  it('splits a link across lines with the link on each piece', () => {
    const url = 'https://example.com/';
    const width = writer.widthOf('one two', 'Helvetica', 9) + 1;
    const block = lay([range('one '), { text: 'two three', style, link: url }], width);
    expect(block.lines.map((line) => line.runs.map((run) => [run.text, run.link]))).toEqual([
      [
        ['one ', undefined],
        ['two', url],
      ],
      [['three', url]],
    ]);
  });

  it('does not reuse a cached block for the same text with another link', () => {
    const cache = new TextMeasureCache();
    const plain = layoutRanges([range('same')], style, Infinity, writer, undefined, cache);
    const linked = layoutRanges(
      [{ text: 'same', style, link: 'https://example.com/' }],
      style,
      Infinity,
      writer,
      undefined,
      cache,
    );
    expect(plain.lines[0]?.runs[0]?.link).toBeUndefined();
    expect(linked.lines[0]?.runs[0]?.link).toBe('https://example.com/');
  });

  it('rejects ranges over 1 MB in total', () => {
    const half = 'a'.repeat(524_289);
    expect(() => lay([range(half), range(half)])).toThrow('ngpdf: text longer than 1 MB');
  });
});

describe('letter-spacing and text-transform', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });
  const width = (text: string) => writer.widthOf(text, 'Helvetica', 9);
  const range = (text: string): TextRange => ({ text, style });
  const lay = (ranges: readonly TextRange[], maxWidth = Infinity) =>
    layoutRanges(ranges, style, maxWidth, writer);

  it('adds letter-spacing after every character of a run, the last one too', () => {
    const spaced: TextStyle = { ...style, letterSpacing: 2 };
    const [line] = layoutText('Total', spaced, Infinity, writer).lines;
    expect(line?.width).toBeCloseTo(width('Total') + 5 * 2, 6);
    expect(line?.runs[0]).toMatchObject({ text: 'Total', letterSpacing: 2 });
  });

  it('counts a letter and its combining mark as one character', () => {
    // A standard font draws a combining sequence as "?", so this needs a font that has the mark.
    writer.registerFont('font:0', testFont('noto-sans-regular.ttf'));
    const spaced: TextStyle = { ...style, letterSpacing: 2 };
    const text = 'Cafe\u0301';
    const [line] = layoutText(text, spaced, Infinity, writer, undefined, undefined, {
      chain: ['font:0'],
    }).lines;
    expect(line?.width).toBeCloseTo(writer.widthOf(text, 'font:0', 9) + 4 * 2, 6);
  });

  it('wraps by the spaced width', () => {
    const text = 'ab ab ab ab';
    const fitsPlain = width('ab ab ab') + 0.5;
    expect(layoutText(text, style, fitsPlain, writer).lines).toHaveLength(2);
    const spaced = layoutText(text, { ...style, letterSpacing: 3 }, fitsPlain, writer);
    expect(spaced.lines.length).toBeGreaterThan(2);
    for (const line of spaced.lines) expect(line.width).toBeLessThanOrEqual(fitsPlain);
  });

  it('measures letter-spaced text without ligatures, which a cluster at a time cannot draw', () => {
    // An "fi" ligature 4pt narrower than its letters.
    const ligatures: FontMetrics = {
      widthOf: (text, _font, _size, withLigatures) =>
        10 * text.length - (withLigatures !== false && text.includes('fi') ? 4 : 0),
      ascent: () => 0,
      hasGlyph: () => false,
    };
    expect(layoutText('fi', style, Infinity, ligatures).width).toBe(16);
    expect(layoutText('fi', { ...style, letterSpacing: 1 }, Infinity, ligatures).width).toBe(22);
  });

  it('fits the ellipsis of a clamped line by the spaced width', () => {
    const spaced: ParagraphStyle = { ...style, letterSpacing: 2, maxLines: 1 };
    const maxWidth = 80;
    const [line, ...rest] = layoutRanges(
      [{ text: 'Gabriela Teixeira de Albuquerque', style: spaced }],
      spaced,
      maxWidth,
      writer,
    ).lines;
    expect(rest).toHaveLength(0);
    expect(line?.text.endsWith('…')).toBe(true);
    const drawn = line?.text ?? '';
    expect(line?.width).toBeCloseTo(width(drawn) + 2 * graphemeCount(drawn), 6);
    expect(line?.width).toBeLessThanOrEqual(maxWidth);
  });

  it('spaces only the range that sets letter-spacing', () => {
    const [line] = lay([range('ab'), { text: 'cd', style: { ...style, letterSpacing: 1 } }]).lines;
    expect(line?.runs.map((run) => [run.text, run.letterSpacing])).toEqual([
      ['ab', 0],
      ['cd', 1],
    ]);
    expect(line?.width).toBeCloseTo(width('ab') + width('cd') + 2, 6);
  });

  it('upper- and lowercases before measuring, without a locale', () => {
    const [upper] = layoutText(
      'Straße',
      { ...style, textTransform: 'uppercase' },
      Infinity,
      writer,
    ).lines;
    expect(upper?.text).toBe('STRASSE');
    expect(upper?.width).toBeCloseTo(width('STRASSE'), 6);
    const [lower] = layoutText(
      'ÁGUA Viva',
      { ...style, textTransform: 'lowercase' },
      Infinity,
      writer,
    ).lines;
    expect(lower?.text).toBe('água viva');
  });

  it('capitalizes the first letter of each word across ranges, after leading punctuation', () => {
    const capitalize: TextStyle = { ...style, textTransform: 'capitalize' };
    const [line] = lay([
      { text: 'olá (mundo) 2nd', style: capitalize },
      { text: ' fe', style: capitalize },
      { text: 'ira', style: capitalize },
    ]).lines;
    expect(line?.text).toBe('Olá (Mundo) 2nd Feira');
  });

  it('transforms each range by its own text-transform, after collapsing whitespace', () => {
    const [line] = lay([
      { text: '  total ', style: { ...style, textTransform: 'uppercase' } },
      range('  pago'),
    ]).lines;
    expect(line?.text).toBe('TOTAL pago');
  });

  it('keeps blocks that differ only in letter-spacing or text-transform apart in the cache', () => {
    const cache = new TextMeasureCache();
    const plain = layoutText('abc', style, Infinity, writer, undefined, cache);
    const spaced = layoutText(
      'abc',
      { ...style, letterSpacing: 1 },
      Infinity,
      writer,
      undefined,
      cache,
    );
    const upper = layoutText(
      'abc',
      { ...style, textTransform: 'uppercase' },
      Infinity,
      writer,
      undefined,
      cache,
    );
    expect(spaced.width).toBeCloseTo(plain.width + 3, 6);
    expect(upper.lines[0]?.text).toBe('ABC');
  });
});

describe('layoutRanges with maxLines', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
    writer.registerFont('font:0', testFont('inter-basic.otf'));
  });
  const text = 'Gabriela Teixeira de Albuquerque Cavalcanti mora em Recife desde 2019';
  const clamped = (maxLines: number | null, maxWidth = 120, ranges?: readonly TextRange[]) =>
    layoutRanges(ranges ?? [{ text, style }], { ...style, maxLines }, maxWidth, writer);

  it('keeps every line when the text fits in maxLines', () => {
    const all = clamped(null);
    expect(clamped(all.lines.length)).toEqual(all);
  });

  it('keeps maxLines lines and measures only those', () => {
    const block = clamped(2);
    expect(block.lines).toHaveLength(2);
    expect(block.height).toBe(27);
  });

  it('ends the last kept line with an ellipsis that fits the box', () => {
    const all = clamped(null);
    const [, second] = clamped(2).lines;
    const kept = second?.text.slice(0, -1) ?? '';
    expect(second?.text.endsWith('…')).toBe(true);
    expect(second?.width).toBeLessThanOrEqual(120);
    expect(kept).toBe(kept.trimEnd());
    expect(all.lines[1]?.text.startsWith(kept)).toBe(true);
    expect(second?.width).toBeCloseTo(writer.widthOf(second?.text ?? '', 'Helvetica', 9), 6);
  });

  it('cuts characters off the last line until the ellipsis fits', () => {
    // At 30pt the first line is a piece of "Gabriela", which leaves no room for the ellipsis.
    const full = clamped(null, 30).lines[0]?.text ?? '';
    const [line] = clamped(1, 30).lines;
    expect(line?.width).toBeLessThanOrEqual(30);
    expect(line?.text.endsWith('…')).toBe(true);
    const kept = line?.text.slice(0, -1) ?? '';
    expect(kept.length).toBeLessThan(full.length);
    expect(writer.widthOf(`${text.slice(0, kept.length + 1)}…`, 'Helvetica', 9)).toBeGreaterThan(
      30,
    );
  });

  it('draws the ellipsis in the style of the last run on the line', () => {
    const bold: TextStyle = { ...style, fontWeight: 'bold' };
    const [line] = clamped(1, 120, [
      { text: 'Status: ', style },
      { text: 'aprovado sem ressalvas pela comissão', style: bold },
    ]).lines;
    const last = line?.runs.at(-1);
    expect(last?.font).toBe('Helvetica-Bold');
    expect(last?.text.endsWith('…')).toBe(true);
  });

  it('draws the ellipsis in the style of the last kept run when the cut removes a whole run', () => {
    const bold: TextStyle = { ...style, fontWeight: 'bold' };
    // The box holds "Status aprovado x" with 2pt to spare, so the ellipsis fits only once "x" is gone.
    const maxWidth =
      writer.widthOf('Status aprovado ', 'Helvetica', 9) +
      writer.widthOf('x', 'Helvetica-Bold', 9) +
      2;
    const [line] = clamped(1, maxWidth, [
      { text: 'Status aprovado ', style },
      { text: 'x', style: bold },
      { text: ' com ressalvas', style },
    ]).lines;
    expect(line?.text).toBe('Status aprovado…');
    expect(line?.runs.map((run) => run.font)).toEqual(['Helvetica']);
    expect(line?.width).toBeCloseTo(writer.widthOf('Status aprovado…', 'Helvetica', 9), 6);
  });

  it('draws nothing when not even the ellipsis fits the box, keeping the line height', () => {
    const block = clamped(1, 3);
    expect(block.lines[0]?.text).toBe('');
    expect(block.width).toBe(0);
    expect(block.height).toBe(clamped(1, 10).height);
  });

  it('finds the longest cut when a smaller face after a large one makes the ellipsis narrower', () => {
    // Each character is as wide as its font size: "QX…" is 9 + 60 + 60 = 129pt, "QXa…" 87pt.
    const sized: FontMetrics = {
      widthOf: (chunk, _font, size) => size * chunk.length,
      ascent: () => 0,
      hasGlyph: () => false,
    };
    const big: TextStyle = { ...style, fontSize: 60 };
    const ranges = [
      { text: 'Q', style },
      { text: 'X', style: big },
      { text: 'a bbbbbbbb', style },
    ];
    const [line] = layoutRanges(ranges, { ...style, maxLines: 1 }, 88, sized).lines;
    expect(line?.text).toBe('QXa…');
    expect(line?.width).toBe(87);
  });

  it('marks a cut line as the last, so justify leaves it alone', () => {
    const lines = clamped(2).lines;
    expect(lines.map((line) => line.last)).toEqual([false, true]);
  });

  it('falls back to three dots when the font has no ellipsis', () => {
    const [line] = clamped(1, 120, [{ text, style, fonts: { chain: ['font:0'] } }]).lines;
    expect(line?.text.endsWith('...')).toBe(true);
    expect(line?.width).toBeLessThanOrEqual(120);
  });

  it('keeps the ellipsis alone when not even one character fits beside it', () => {
    const [line] = clamped(1, 10).lines;
    expect(line?.text).toBe('…');
  });

  it('does not reuse a block cached without the limit', () => {
    const cache = new TextMeasureCache();
    const lay = (maxLines: number | null) =>
      layoutRanges([{ text, style }], { ...style, maxLines }, 120, writer, undefined, cache);
    expect(lay(null).lines.length).toBeGreaterThan(2);
    expect(lay(2).lines).toHaveLength(2);
  });
});
