import fc from 'fast-check';
import { beforeAll, describe, it } from 'vitest';
import { toWinAnsi } from './fonts';
import { ROOT_TEXT_STYLE } from './style';
import { layoutText, TextMeasureCache } from './text';
import { createPdfkitWriter, type FontMetrics, type PdfWriter } from './writer';

const noWhitespace = (text: string): string => text.replace(/\s/g, '');

describe('layoutText properties', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });

  const wordish = fc.oneof(
    fc.string({ unit: 'grapheme', maxLength: 40 }),
    fc
      .array(fc.constantFrom('ab', 'WW', ' ', '  ', '\n', '\t', '-', '/', '.', 'x'), {
        maxLength: 60,
      })
      .map((parts) => parts.join('')),
  );

  // A box of at least 12pt holds any single WinAnsi character at 10pt.
  const property = (): fc.IPropertyWithHooks<[string, number]> =>
    fc.property(wordish, fc.double({ min: 12, max: 300, noNaN: true }), (text, maxWidth) => {
      const style = { ...ROOT_TEXT_STYLE, fontSize: 10 };
      const block = layoutText(text, style, maxWidth, writer);
      for (const line of block.lines) {
        if (line.text === '' || line.text.startsWith(' ') || line.text.endsWith(' ')) return false;
        if (line.width > maxWidth || writer.widthOf(line.text, 'Helvetica', 10) > maxWidth) {
          return false;
        }
      }
      const joined = block.lines.map((line) => line.text).join('');
      return noWhitespace(joined) === noWhitespace(toWinAnsi(text, () => undefined));
    });

  it('keeps every line within maxWidth and loses no non-whitespace character', () => {
    fc.assert(property());
  });

  it('holds for the seed that once found a kerning overflow', () => {
    fc.assert(property(), { seed: -1214594155 });
  });

  it('holds for the seed that once found an ideographic space drawn as ?', () => {
    fc.assert(property(), { seed: 280 });
  });

  it('loses nothing and overflows nowhere with kerning that widens text', () => {
    // Each "-b", "rt" and "_r" draws wider than the sum of its characters, so sums under-estimate.
    const kerning: FontMetrics = {
      widthOf: (text) => 10 * text.length + 6 * (text.match(/-b|rt|_r/g)?.length ?? 0),
      ascent: () => 0,
      hasGlyph: () => false,
    };
    const parts = fc.array(fc.constantFrom('a', 'b', '-', '_', 'r', 't', ' ', '  ', '.', '/'), {
      maxLength: 80,
    });
    fc.assert(
      fc.property(parts, fc.integer({ min: 10, max: 120 }), (chars, maxWidth) => {
        const text = chars.join('');
        const block = layoutText(text, ROOT_TEXT_STYLE, maxWidth, kerning);
        const joined = block.lines.map((line) => line.text).join('');
        return (
          block.lines.every(
            (line) =>
              line.width <= maxWidth &&
              kerning.widthOf(line.text, 'Helvetica', 1) === line.width &&
              line.text !== '' &&
              !line.text.startsWith(' ') &&
              !line.text.endsWith(' '),
          ) && noWhitespace(joined) === noWhitespace(text)
        );
      }),
      { numRuns: 500 },
    );
  });

  it('keeps hyphenated lines within maxWidth and loses no letter', () => {
    const parts = fc.array(fc.constantFrom('ab', 'WW', 'ij', 'x', ' ', '\u00ad'), {
      maxLength: 60,
    });
    const hyphens = fc.constantFrom('manual' as const, 'auto' as const, 'none' as const);
    fc.assert(
      fc.property(
        parts,
        fc.double({ min: 12, max: 200, noNaN: true }),
        hyphens,
        (chars, maxWidth, mode) => {
          const text = chars.join('');
          // Lets every word break between any two letters.
          const cache = new TextMeasureCache({ hyphenate: (word) => Array.from(word) });
          const style = { ...ROOT_TEXT_STYLE, fontSize: 10, hyphens: mode };
          const block = layoutText(text, style, maxWidth, writer, undefined, cache);
          const fits = block.lines.every(
            (line) =>
              line.width <= maxWidth && writer.widthOf(line.text, 'Helvetica', 10) <= maxWidth,
          );
          // The input has no hyphen-minus, so each one ends a hyphenated line.
          const hyphenOnlyAtEnds = block.lines.every(
            (line) =>
              !line.text.slice(0, -1).includes('-') && !(line.last && line.text.endsWith('-')),
          );
          const joined = block.lines.map((line) => line.text.replace(/-$/, '')).join('');
          return (
            fits &&
            hyphenOnlyAtEnds &&
            noWhitespace(joined) === noWhitespace(text.replaceAll('\u00ad', ''))
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});
