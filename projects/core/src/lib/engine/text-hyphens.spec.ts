import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ROOT_TEXT_STYLE, type TextStyle } from './style';
import { layoutRanges, layoutText, TextMeasureCache, type Hyphenate, type TextRange } from './text';
import { testFont } from '../../testing/test-fonts';
import { createPdfkitWriter, type FontMetrics, type PdfWriter } from './writer';

const SHY = '­';
const style: TextStyle = { ...ROOT_TEXT_STYLE, fontSize: 9, lineHeight: 1.5 };
const auto: TextStyle = { ...style, hyphens: 'auto' };
const none: TextStyle = { ...style, hyphens: 'none' };

// A tiny dictionary standing in for a pattern library.
const DICTIONARY = new Map<string, readonly string[]>([
  ['hyphenation', ['hy', 'phen', 'ation']],
  ['HYPHENATION', ['HY', 'PHEN', 'ATION']],
  ['extraordinary', ['ex', 'tra', 'or', 'di', 'nary']],
]);
const dictionary: Hyphenate = (word) => DICTIONARY.get(word) ?? [word];

describe('hyphens: manual', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });
  const width = (text: string): number => writer.widthOf(text, 'Helvetica', 9);
  const lines = (text: string, maxWidth: number, textStyle: TextStyle = style) =>
    layoutText(text, textStyle, maxWidth, writer).lines.map((line) => line.text);

  it('breaks at a soft hyphen and draws a hyphen at the end of the line', () => {
    const block = layoutText(`hyphen${SHY}ation`, style, width('hyphen-') + 0.1, writer);
    expect(block.lines.map((line) => line.text)).toEqual(['hyphen-', 'ation']);
    expect(block.lines[0]?.width).toBeCloseTo(width('hyphen-'), 6);
    expect(block.lines[0]?.last).toBe(false);
  });

  it('takes the last soft hyphen that fits', () => {
    expect(lines(`co${SHY}op${SHY}er${SHY}ation`, width('cooper-') + 0.1)).toEqual([
      'cooper-',
      'ation',
    ]);
  });

  it('hyphenates the word that does not fit after the words that do', () => {
    expect(lines(`an extra${SHY}ordinary day`, width('an extra-') + 0.1)).toEqual([
      'an extra-',
      'ordinary',
      'day',
    ]);
  });

  it('prefers a break between words when the whole line fits', () => {
    expect(lines(`an extra${SHY}ordinary`, width('an extraordinary') + 0.1)).toEqual([
      'an extraordinary',
    ]);
    expect(lines(`an extra${SHY}ordinary`, width('an extra') - 0.1).slice(0, 2)).toEqual([
      'an',
      'extra-',
    ]);
  });

  it('breaks at the box edge when no soft hyphen leaves a piece that fits', () => {
    const block = layoutText(`abcdefgh${SHY}ij`, style, width('abc') + 0.1, writer);
    expect(block.lines[0]?.text).toBe('abc');
  });

  it('leaves no double space where a soft hyphen sat beside a space', () => {
    expect(lines(`a ${SHY} b ${SHY}c${SHY} d`, 500)).toEqual(['a b c d']);
    expect(
      layoutRanges(
        [
          { text: `a${SHY}`, style },
          { text: ` ${SHY}b`, style },
        ],
        style,
        500,
        writer,
      ).lines.map((line) => line.text),
    ).toEqual(['a b']);
  });

  it('ignores soft hyphens at the ends of the text', () => {
    expect(lines(`${SHY}abc${SHY}`, width('abc') + 0.1)).toEqual(['abc']);
  });

  it('draws the hyphen in the face of the run it ends, with its decoration', () => {
    const underlined: TextStyle = { ...style, textDecoration: 'underline', fontWeight: 'bold' };
    const block = layoutRanges(
      [
        { text: 'an ', style },
        { text: `extra${SHY}ordinary`, style: underlined },
      ],
      style,
      width('an ') + writer.widthOf('extra-', 'Helvetica-Bold', 9) + 0.1,
      writer,
    );
    const run = block.lines[0]?.runs.at(-1);
    expect(run).toMatchObject({ text: 'extra-', font: 'Helvetica-Bold', decoration: 'underline' });
    expect(run?.width).toBeCloseTo(writer.widthOf('extra-', 'Helvetica-Bold', 9), 6);
  });

  it('keeps hyphenated lines justifiable, and the last line last', () => {
    const block = layoutText(
      `hyphen${SHY}ation`,
      { ...style, textAlign: 'justify' },
      width('hyphen-') + 0.1,
      writer,
    );
    expect(block.lines.map((line) => line.last)).toEqual([false, true]);
  });

  it('ends a line cut by max-lines with the ellipsis, not a hyphen', () => {
    const block = layoutRanges(
      [{ text: `extra${SHY}ordinary words`, style }],
      { ...style, maxLines: 1 },
      width('extra-') + 0.1,
      writer,
    );
    expect(block.lines).toHaveLength(1);
    expect(block.lines[0]?.text.endsWith('…')).toBe(true);
    expect(block.lines[0]?.text).not.toContain('-');
  });

  it('keeps the hyphen of a line above the one max-lines cuts', () => {
    const block = layoutRanges(
      [{ text: `extra${SHY}ordinary words go here`, style }],
      { ...style, maxLines: 2 },
      width('extra-') + 0.1,
      writer,
    );
    expect(block.lines[0]?.text).toBe('extra-');
    expect(block.lines[1]?.text.endsWith('…')).toBe(true);
  });

  it('counts letter-spacing on the hyphen', () => {
    const spaced: TextStyle = { ...style, letterSpacing: 2 };
    const block = layoutText(`hyphen${SHY}ation`, spaced, width('hyphen-') + 14 + 0.1, writer);
    expect(block.lines.map((line) => line.text)).toEqual(['hyphen-', 'ation']);
    expect(block.lines[0]?.width).toBeCloseTo(
      writer.widthOf('hyphen-', 'Helvetica', 9, false) + 14,
      6,
    );
  });
});

describe('hyphens: none', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });
  const width = (text: string): number => writer.widthOf(text, 'Helvetica', 9);

  it('does not break at soft hyphens, and still draws none', () => {
    const block = layoutText(`an extra${SHY}ordinary`, none, width('an extra-') + 0.1, writer);
    expect(block.lines[0]?.text).toBe('an');
    expect(block.lines.map((line) => line.text).join('')).toBe('anextraordinary');
  });

  it('applies to the range of a pdf-span only', () => {
    const block = layoutRanges(
      [
        { text: `co${SHY}op `, style },
        { text: `co${SHY}op`, style: none },
      ],
      style,
      width('co-') + 0.1,
      writer,
    );
    expect(block.lines.map((line) => line.text)).toEqual(['co-', 'op', 'co', 'op']);
  });

  it('keeps blocks that differ only in hyphens apart in the cache', () => {
    const cache = new TextMeasureCache();
    const text = `extra${SHY}ordinary`;
    const narrow = width('extra-') + 0.1;
    const manual = layoutText(text, style, narrow, writer, undefined, cache);
    const off = layoutText(text, none, narrow, writer, undefined, cache);
    expect(manual.lines[0]?.text).toBe('extra-');
    expect(off.lines[0]?.text).not.toBe('extra-');
  });
});

describe('the hyphen glyph', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
    writer.registerFont('font:0', testFont('noto-sans-regular.ttf'));
    writer.registerFont('font:1', testFont('inter-basic.otf'));
  });

  it('is U+2010 in a font that has it', () => {
    const narrow = writer.widthOf('hyphen‐', 'font:0', 9) + 0.1;
    const block = layoutText(`hyphen${SHY}ation`, style, narrow, writer, undefined, undefined, {
      chain: ['font:0', 'Helvetica'],
    });
    expect(block.lines.map((line) => line.text)).toEqual(['hyphen‐', 'ation']);
    expect(block.lines[0]?.runs.map((run) => run.font)).toEqual(['font:0']);
  });

  it('is a hyphen-minus in a font without U+2010', () => {
    const narrow = writer.widthOf('hyphen-', 'font:1', 9) + 0.1;
    const block = layoutText(`hyphen${SHY}ation`, style, narrow, writer, undefined, undefined, {
      chain: ['font:1', 'Helvetica'],
    });
    expect(block.lines.map((line) => line.text)).toEqual(['hyphen-', 'ation']);
  });
});

describe('hyphens: auto', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });
  const width = (text: string): number => writer.widthOf(text, 'Helvetica', 9);
  const cacheWith = (hyphenate?: Hyphenate, warn = vi.fn()) =>
    new TextMeasureCache({ ...(hyphenate && { hyphenate }), language: 'en-US', warn });
  const lines = (
    text: string,
    maxWidth: number,
    cache: TextMeasureCache,
    textStyle: TextStyle = auto,
  ) => layoutText(text, textStyle, maxWidth, writer, undefined, cache).lines.map((l) => l.text);

  it('breaks a word that does not fit where the hyphenation function allows', () => {
    const hyphenate = vi.fn(dictionary);
    expect(lines('a hyphenation', width('a hyphen-') + 0.1, cacheWith(hyphenate))).toEqual([
      'a hyphen-',
      'ation',
    ]);
    expect(hyphenate).toHaveBeenCalledWith('hyphenation', 'en-US');
  });

  it('does not ask about a word that fits', () => {
    const hyphenate = vi.fn(dictionary);
    expect(lines('a hyphenation', 500, cacheWith(hyphenate))).toEqual(['a hyphenation']);
    expect(hyphenate).not.toHaveBeenCalled();
  });

  it('breaks a word too long for an empty line at every piece it needs', () => {
    const cache = cacheWith(dictionary);
    expect(lines('hyphenation', width('phen-') + 0.1, cache)).toEqual(['hy-', 'phen-', 'ation']);
  });

  it('breaks at the box edge when no piece fits', () => {
    const cache = cacheWith(dictionary);
    const block = lines('hyphenation', width('h') + 0.1, cache);
    expect(block.every((line) => !line.endsWith('-'))).toBe(true);
    expect(block.join('')).toBe('hyphenation');
  });

  it('calls the function once per word in a render', () => {
    const hyphenate = vi.fn(dictionary);
    const cache = cacheWith(hyphenate);
    lines('hyphenation hyphenation', width('hyphen-') + 0.1, cache);
    lines('so hyphenation', width('so hyphen-') + 0.1, cache);
    expect(hyphenate).toHaveBeenCalledTimes(1);
  });

  it('hyphenates only words of 5 letters or more, keeping 2 letters on each side', () => {
    const hyphenate = vi.fn((word: string) => Array.from(word));
    const cache = cacheWith(hyphenate);
    expect(lines('abcd', width('ab-') + 0.1, cache).some((l) => l.endsWith('-'))).toBe(false);
    expect(hyphenate).not.toHaveBeenCalled();
    // abcdef may break only after ab, abc or abcd.
    expect(lines('abcdef', width('abcd-') + 0.1, cache)).toEqual(['abcd-', 'ef']);
    expect(
      lines(
        'abcdef',
        width('ab-') + 0.1,
        cacheWith((w) => Array.from(w)),
      )[0],
    ).toBe('ab-');
    expect(hyphenate).toHaveBeenCalledWith('abcdef', 'en-US');
  });

  it('keeps 2 letters after the break, and 2 before it', () => {
    const cache = cacheWith((word) => Array.from(word));
    expect(lines('abcdew', width('abcde-') + 0.1, cache)).toEqual(['abcd-', 'ew']);
    expect(lines('abcdew', width('a-') + 0.1, cache)[0]).toBe('a');
  });

  it('never breaks between a letter and its combining mark', () => {
    // Every unit 10pt wide, the combining mark too, and every glyph present.
    const metrics: FontMetrics = {
      widthOf: (text) => 10 * text.length,
      ascent: () => 0,
      hasGlyph: () => true,
    };
    // Every UTF-16 unit is offered as a piece; only cluster boundaries are taken.
    const cache = cacheWith((word) => word.split(''));
    const block = layoutText('abcde\u0301fgh', auto, 65, metrics, undefined, cache, {
      chain: ['font:0'],
    });
    expect(block.lines[0]?.text).toBe('abcd\u2010');
  });

  it('hyphenates the letters of a word, leaving punctuation around them', () => {
    const hyphenate = vi.fn(dictionary);
    expect(lines('(hyphenation),', width('(hyphen-') + 0.1, cacheWith(hyphenate))).toEqual([
      '(hyphen-',
      'ation),',
    ]);
    expect(hyphenate).toHaveBeenCalledWith('hyphenation', 'en-US');
  });

  it('uses only the soft hyphens of a word that has some', () => {
    const hyphenate = vi.fn(dictionary);
    expect(lines(`hyphena${SHY}tion`, width('hyphena-') + 0.1, cacheWith(hyphenate))).toEqual([
      'hyphena-',
      'tion',
    ]);
    expect(hyphenate).not.toHaveBeenCalled();
  });

  it('hyphenates the transformed text', () => {
    const hyphenate = vi.fn(dictionary);
    const upper: TextStyle = { ...auto, textTransform: 'uppercase' };
    const narrow = width('HYPHEN-') + 0.1;
    expect(lines('hyphenation', narrow, cacheWith(hyphenate), upper)).toEqual(['HYPHEN-', 'ATION']);
    expect(hyphenate).toHaveBeenCalledWith('HYPHENATION', 'en-US');
  });

  it('applies only to the ranges that set it', () => {
    const hyphenate = vi.fn(dictionary);
    const ranges: TextRange[] = [
      { text: 'hyphenation ', style },
      { text: 'hyphenation', style: auto },
    ];
    const block = layoutRanges(
      ranges,
      style,
      width('hyphen-') + 0.1,
      writer,
      undefined,
      cacheWith(hyphenate),
    );
    expect(block.lines.map((line) => line.text)).toEqual(['hyphen', 'ation', 'hyphen-', 'ation']);
  });

  it('ignores pieces that do not join back to the word, with one warning', () => {
    const warn = vi.fn();
    const cache = cacheWith(() => ['hy', 'fen', 'ation'], warn);
    const block = lines('hyphenation extraordinary', width('hyphen-') + 0.1, cache);
    expect(block.some((line) => line.endsWith('-'))).toBe(false);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'ngpdf: the hyphenation function failed or returned pieces that are not the word, for "hyphenation"; words it fails on are not hyphenated',
    );
  });

  it('ignores a word the function throws on, with one warning', () => {
    const warn = vi.fn();
    const cache = cacheWith(() => {
      throw new Error('no patterns');
    }, warn);
    const block = lines('hyphenation', width('hyphen-') + 0.1, cache);
    expect(block.some((line) => line.endsWith('-'))).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('ignores a result that is not a list of strings', () => {
    const cache = cacheWith(() => 'hy-phen-ation' as unknown as readonly string[]);
    expect(lines('hyphenation', width('hyphen-') + 0.1, cache).join('')).toBe('hyphenation');
    // Not a string, though it would join back to the word as one.
    const nested = cacheWith(() => ['hy', ['phen'], 'ation'] as unknown as readonly string[]);
    expect(lines('hyphenation', width('hyphen-') + 0.1, nested).join('')).toBe('hyphenation');
  });

  it('hyphenates at soft hyphens only, with one warning, without a hyphenation function', () => {
    const warn = vi.fn();
    const cache = cacheWith(undefined, warn);
    expect(lines(`extra${SHY}ordinary hyphenation`, width('extra-') + 0.1, cache)[0]).toBe(
      'extra-',
    );
    lines('hyphenation', width('hyphen-') + 0.1, cache);
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: hyphens: auto needs providePdfHyphenation; words break only at soft hyphens',
    );
    expect(new Set(warn.mock.calls.map(([message]) => message as string)).size).toBe(1);
  });

  it('does not warn about a missing function when no text asks for auto', () => {
    const warn = vi.fn();
    lines('hyphenation', width('hyphen-') + 0.1, cacheWith(undefined, warn), style);
    expect(warn).not.toHaveBeenCalled();
  });
});
