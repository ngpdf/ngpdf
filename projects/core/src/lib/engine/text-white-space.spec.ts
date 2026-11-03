import { describe, expect, it } from 'vitest';
import { ROOT_TEXT_STYLE, type TextStyle } from './style';
import { layoutRanges, layoutText, measureText, TextMeasureCache, type TextRange } from './text';
import type { FontMetrics } from './writer';

const MEASURE_MODE_UNDEFINED = 0;

// Every character is as wide as the font size, so a space is 10 at size 10 and a tab stop is 80.
const metrics: FontMetrics = {
  widthOf: (text, _font, size) => size * text.length,
  ascent: (_font, size) => size * 0.8,
  hasGlyph: () => false,
};

const base: TextStyle = { ...ROOT_TEXT_STYLE, fontSize: 10, lineHeight: 1 };
type WhiteSpace = TextStyle['whiteSpace'];
const styled = (whiteSpace: WhiteSpace, extra: Partial<TextStyle> = {}): TextStyle => ({
  ...base,
  whiteSpace,
  ...extra,
});
const lay = (text: string, whiteSpace: WhiteSpace, maxWidth = Infinity) =>
  layoutText(text, styled(whiteSpace), maxWidth, metrics);
const texts = (text: string, whiteSpace: WhiteSpace, maxWidth = Infinity) =>
  lay(text, whiteSpace, maxWidth).lines.map((line) => line.text);

describe('white-space', () => {
  it('collapses spaces, tabs and line breaks under normal, as before', () => {
    expect(base.whiteSpace).toBe('normal');
    expect(texts('  a \t b\n\nc  ', 'normal')).toEqual(['a b c']);
  });

  it('keeps line breaks and collapses spaces around them under pre-line', () => {
    const block = lay('  12 Main St  \n  Springfield \n', 'pre-line');
    expect(block.lines.map((line) => line.text)).toEqual(['12 Main St', 'Springfield']);
    expect(block.lines.map((line) => line.y)).toEqual([0, 10]);
    expect(block.height).toBe(20);
    expect(texts('a   b\tc', 'pre-line')).toEqual(['a b c']);
  });

  it('still wraps under pre-line, and marks the line before a kept break as last', () => {
    const block = lay('aaa bbb\nccc', 'pre-line', 35);
    expect(block.lines.map((line) => line.text)).toEqual(['aaa', 'bbb', 'ccc']);
    expect(block.lines.map((line) => line.last)).toEqual([false, true, true]);
  });

  it('gives an empty line for each break with nothing between, at the height of the text', () => {
    const block = lay('a\n\nb', 'pre-line');
    expect(block.lines.map((line) => line.text)).toEqual(['a', '', 'b']);
    expect(block.lines.map((line) => [line.y, line.height])).toEqual([
      [0, 10],
      [10, 10],
      [20, 10],
    ]);
    expect(texts('\na', 'pre')).toEqual(['', 'a']);
    // With half-leading, an empty line's baseline sits where a line of its text would.
    const spaced = layoutText('a\n\nb', styled('pre-line', { lineHeight: 1.5 }), Infinity, metrics);
    expect(spaced.lines[1]?.ascent).toBe(spaced.lines[0]?.ascent);
    expect(spaced.lines[1]?.height).toBe(15);
  });

  it('reads CRLF and a lone CR as one line break', () => {
    expect(texts('a\r\nb\rc', 'pre')).toEqual(['a', 'b', 'c']);
    expect(texts('a\r\nb\rc', 'pre-line')).toEqual(['a', 'b', 'c']);
    expect(texts('a\r\n\r\nb', 'pre-wrap')).toEqual(['a', '', 'b']);
    expect(texts('a\r\n\r\nb', 'pre-line')).toEqual(['a', '', 'b']);
    expect(texts('a\r\nb\rc', 'normal')).toEqual(['a b c']);
  });

  it('keeps every space under pre and does not wrap, so a long line overflows', () => {
    const block = lay('  a  b   c', 'pre', 30);
    expect(block.lines.map((line) => line.text)).toEqual(['  a  b   c']);
    expect(block.width).toBe(100);
    expect(texts('abcdefgh', 'pre', 30)).toEqual(['abcdefgh']);
  });

  it('collapses under nowrap and does not wrap or cut a long word', () => {
    expect(texts('a  b\nc', 'nowrap', 20)).toEqual(['a b c']);
    expect(texts('abcdefgh', 'nowrap', 30)).toEqual(['abcdefgh']);
  });

  it('keeps spaces under pre-wrap and wraps after them, letting trailing spaces hang', () => {
    const block = lay('ab   cd', 'pre-wrap', 45);
    expect(block.lines.map((line) => line.text)).toEqual(['ab', 'cd']);
    expect(block.lines[0]?.width).toBe(20);
    expect(texts('  ab', 'pre-wrap')).toEqual(['  ab']);
    expect(texts('ab  \ncd', 'pre-wrap')).toEqual(['ab', 'cd']);
  });

  it('moves a tab to the next stop, every 8 spaces from the line start', () => {
    const at = (text: string) => lay(text, 'pre').lines[0]?.runs.map((run) => [run.text, run.x]);
    expect(at('a\tb')).toEqual([
      ['a', 0],
      ['b', 80],
    ]);
    expect(at('abcdefgh\tb')).toEqual([
      ['abcdefgh', 0],
      ['b', 160],
    ]);
    // A full space to the stop: the tab goes to it.
    expect(lay('abcdefg\tb', 'pre').lines[0]?.runs.at(-1)?.x).toBe(80);
    // Less than half a space to the stop (79 of 80): the tab goes to the one after it, as in CSS.
    const near = layoutRanges(
      [
        { text: 'a', style: styled('pre', { fontSize: 79 }) },
        { text: '\tb', style: styled('pre') },
      ],
      styled('pre'),
      Infinity,
      metrics,
    );
    expect(near.lines[0]?.runs.at(-1)?.x).toBe(160);
    expect(lay('a\tb', 'pre-wrap').lines[0]?.width).toBe(90);
    expect(texts('a\tb', 'pre-wrap')).toEqual(['ab']);
    // Each line starts its own stops.
    expect(lay('abc\n\tb', 'pre').lines[1]?.runs.map((run) => run.x)).toEqual([80]);
  });

  it('measures a tab stop in the font of its run', () => {
    const big = styled('pre', { fontSize: 20 });
    const block = layoutRanges(
      [
        { text: 'a', style: styled('pre') },
        { text: '\tb', style: big },
      ],
      styled('pre'),
      Infinity,
      metrics,
    );
    expect(block.lines[0]?.runs.map((run) => [run.text, run.x])).toEqual([
      ['a', 0],
      ['b', 160],
    ]);
  });

  it('treats a tab as a space that collapses under normal and pre-line', () => {
    expect(texts('a\t\tb', 'normal')).toEqual(['a b']);
    expect(texts('a\t\tb', 'pre-line')).toEqual(['a b']);
  });

  it('cuts at max-lines across kept line breaks, with the ellipsis', () => {
    const block = layoutRanges(
      [{ text: 'a\nb\nc', style: styled('pre-line') }],
      { ...styled('pre-line'), maxLines: 2 },
      Infinity,
      metrics,
    );
    expect(block.lines.map((line) => line.text)).toEqual(['a', 'b…']);
  });

  it('hyphenates wrapping text with kept breaks, and never text that does not wrap', () => {
    expect(texts('ab­cd\nef', 'pre-wrap', 35)).toEqual(['ab-', 'cd', 'ef']);
    expect(texts('ab­cd', 'nowrap', 35)).toEqual(['abcd']);
  });

  it('does not break inside a nowrap span in a normal paragraph', () => {
    const ranges = (inner: WhiteSpace): TextRange[] => [
      { text: 'aa bb ', style: styled('normal') },
      { text: 'cc dd', style: styled(inner) },
      { text: ' ee', style: styled('normal') },
    ];
    const lines = (inner: WhiteSpace) =>
      layoutRanges(ranges(inner), styled('normal'), 35, metrics).lines.map((line) => line.text);
    expect(lines('normal')).toEqual(['aa', 'bb', 'cc', 'dd', 'ee']);
    expect(lines('nowrap')).toEqual(['aa', 'bb', 'cc dd', 'ee']);
  });

  it('measures the widest kept line with no width limit', () => {
    const measure = measureText('ab\nabcd\nc', styled('pre'), metrics);
    expect(measure(0, MEASURE_MODE_UNDEFINED)).toEqual({ width: 40, height: 30 });
  });

  it('does not reuse a cached block across white-space values', () => {
    const cache = new TextMeasureCache();
    const one = layoutText('a\nb', styled('normal'), Infinity, metrics, undefined, cache);
    const two = layoutText('a\nb', styled('pre-line'), Infinity, metrics, undefined, cache);
    expect(one.lines).toHaveLength(1);
    expect(two.lines).toHaveLength(2);
  });
});
