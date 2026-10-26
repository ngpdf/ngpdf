import { describe, expect, it, vi } from 'vitest';
import {
  fontChain,
  fontFor,
  parseFontFamily,
  shapeText,
  toWinAnsi,
  type FontRegistry,
} from './fonts';
import type { CustomFont, FontName } from './writer';

describe('fontFor', () => {
  it.each([
    ['Helvetica', 'normal', 'normal', 'Helvetica'],
    ['Helvetica', 'bold', 'normal', 'Helvetica-Bold'],
    ['Helvetica', 'normal', 'italic', 'Helvetica-Oblique'],
    ['Helvetica', 'bold', 'italic', 'Helvetica-BoldOblique'],
    ['Times', 'normal', 'normal', 'Times-Roman'],
    ['Times', 'bold', 'normal', 'Times-Bold'],
    ['Times', 'normal', 'italic', 'Times-Italic'],
    ['Times', 'bold', 'italic', 'Times-BoldItalic'],
    ['Courier', 'normal', 'normal', 'Courier'],
    ['Courier', 'bold', 'normal', 'Courier-Bold'],
    ['Courier', 'normal', 'italic', 'Courier-Oblique'],
    ['Courier', 'bold', 'italic', 'Courier-BoldOblique'],
  ] as const)('maps %s %s %s to %s', (fontFamily, fontWeight, fontStyle, expected) => {
    expect(fontFor({ fontFamily, fontWeight, fontStyle })).toBe(expected);
  });
});

describe('toWinAnsi', () => {
  it('replaces characters outside WinAnsi with ? and warns once with them', () => {
    const warn = vi.fn();
    expect(toWinAnsi('Olá € 😀 ő', warn)).toBe('Olá € ? ?');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(['😀', 'ő']);
  });

  it('does not warn when everything is supported', () => {
    const warn = vi.fn();
    expect(toWinAnsi('plain “quotes” — ÿ', warn)).toBe('plain “quotes” — ÿ');
    expect(warn).not.toHaveBeenCalled();
  });

  it('lists each unsupported character once and replaces CJK', () => {
    const warn = vi.fn();
    expect(toWinAnsi('漢ő漢', warn)).toBe('???');
    expect(warn).toHaveBeenCalledWith(['漢', 'ő']);
  });

  it('keeps tab and newline out of the replacement', () => {
    const warn = vi.fn();
    expect(toWinAnsi('a\tb\nc', warn)).toBe('a\tb\nc');
    expect(warn).not.toHaveBeenCalled();
  });

  it('turns Unicode space separators into a space, without warning', () => {
    const warn = vi.fn();
    const spaces = '           ';
    expect(toWinAnsi(`a${spaces}b`, warn)).toBe(`a${' '.repeat(spaces.length)}b`);
    expect(warn).not.toHaveBeenCalled();
  });

  it('turns the no-break spaces among them into U+00A0', () => {
    // Angular's en-US `date: 'short'` puts U+202F before AM/PM; fr `number` groups with it.
    const warn = vi.fn();
    expect(toWinAnsi('3:00 PM', warn)).toBe('3:00 PM');
    expect(toWinAnsi('1 234', warn)).toBe('1 234');
    expect(warn).not.toHaveBeenCalled();
  });

  it('drops soft hyphens and zero-width spaces, which are never drawn', () => {
    const warn = vi.fn();
    expect(toWinAnsi('co­operation', warn)).toBe('cooperation');
    expect(toWinAnsi('long​path', warn)).toBe('longpath');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('parseFontFamily', () => {
  it('splits a CSS family list and unquotes its names', () => {
    expect(parseFontFamily(` Inter , "Noto Sans JP",'Times New Roman', serif `)).toEqual([
      'Inter',
      'Noto Sans JP',
      'Times New Roman',
      'serif',
    ]);
  });

  it('keeps a comma inside quotes and drops empty entries', () => {
    expect(parseFontFamily('"A, B",, C')).toEqual(['A, B', 'C']);
  });
});

const INTER: FontRegistry = new Map([
  [
    'inter',
    [
      { weight: 'normal', style: 'normal', font: 'font:0' },
      { weight: 'bold', style: 'normal', font: 'font:1' },
    ],
  ],
  ['noto sans jp', [{ weight: 'normal', style: 'normal', font: 'font:2' }]],
]);

const textStyle = (
  fontFamily: string,
  fontWeight: 'normal' | 'bold' = 'normal',
  fontStyle: 'normal' | 'italic' = 'normal',
) => ({ fontFamily, fontWeight, fontStyle });

describe('fontChain', () => {
  it('maps a list with no registered family to one standard font, as before', () => {
    expect(fontChain(textStyle('Georgia, serif'), INTER)).toEqual(['Times-Roman']);
    expect(fontChain(textStyle('Courier New, monospace', 'bold'), INTER)).toEqual(['Courier-Bold']);
    expect(fontChain(textStyle('Arial'), new Map())).toEqual(['Helvetica']);
  });

  it('lists registered families and standard ones in the order written', () => {
    expect(fontChain(textStyle('Helvetica, Inter, "Noto Sans JP"'), INTER)).toEqual([
      'Helvetica',
      'font:0',
      'font:2',
    ]);
  });

  it('skips names that are neither registered nor standard', () => {
    expect(fontChain(textStyle('Roboto, Inter, Times'), INTER)).toEqual(['font:0', 'Times-Roman']);
  });

  it('ends with a standard font when the list names none, for characters in WinAnsi', () => {
    expect(fontChain(textStyle('Inter'), INTER)).toEqual(['font:0', 'Helvetica']);
    expect(fontChain(textStyle('Inter', 'bold'), INTER)).toEqual(['font:1', 'Helvetica-Bold']);
  });

  it('matches family names in any case', () => {
    expect(fontChain(textStyle('INTER'), INTER)[0]).toBe('font:0');
  });

  it('prefers a face of the same weight, then the regular face, and warns', () => {
    const warn = vi.fn();
    expect(fontChain(textStyle('Inter', 'bold', 'italic'), INTER, warn)[0]).toBe('font:1');
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: font "Inter" has no bold italic face; using its bold face',
    );
  });

  it('uses the regular face when the asked-for one is missing, and warns', () => {
    const warn = vi.fn();
    expect(fontChain(textStyle('Noto Sans JP', 'bold', 'italic'), INTER, warn)[0]).toBe('font:2');
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: font "Noto Sans JP" has no bold italic face; using its regular face',
    );
  });

  it('picks the face that matches weight and style', () => {
    const warn = vi.fn();
    expect(fontChain(textStyle('Inter', 'bold'), INTER, warn)[0]).toBe('font:1');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('shapeText', () => {
  // font:0 has Latin and Cyrillic, font:2 has CJK; neither has the snowman.
  const glyphs: Record<CustomFont, (cp: number) => boolean> = {
    'font:0': (cp) => cp < 0x0500,
    'font:2': (cp) => cp === 0x20 || (cp >= 0x3000 && cp < 0xa000),
  };
  const metrics = { hasGlyph: (font: CustomFont, cp: number) => glyphs[font]?.(cp) ?? false };
  const runsOf = (text: string, chain: readonly FontName[]) => {
    const shaped = shapeText(text, chain, metrics);
    const runs: { text: string; font: FontName }[] = [];
    for (let i = 0; i < shaped.text.length; i++) {
      const font = chain[shaped.fontAt[i] ?? 0]!;
      const last = runs.at(-1);
      if (last?.font === font) last.text += shaped.text.charAt(i);
      else runs.push({ text: shaped.text.charAt(i), font });
    }
    return { runs, shaped };
  };

  it('keeps standard-only text as WinAnsi with ? for the rest, in one font', () => {
    const { runs, shaped } = runsOf('Olá 😀', ['Helvetica']);
    expect(runs).toEqual([{ text: 'Olá ?', font: 'Helvetica' }]);
    expect(shaped.replaced).toEqual(['😀']);
    expect(shaped.missing).toEqual([]);
  });

  it('draws each character in the first font of the chain that has it', () => {
    const { runs } = runsOf('Жук 日本 x', ['font:0', 'font:2', 'Helvetica']);
    expect(runs).toEqual([
      { text: 'Жук ', font: 'font:0' },
      { text: '日本 ', font: 'font:2' },
      { text: 'x', font: 'font:0' },
    ]);
  });

  it('keeps a space in the run before it rather than starting a new run', () => {
    const { runs } = runsOf('日 本', ['font:2', 'font:0']);
    expect(runs).toEqual([{ text: '日 本', font: 'font:2' }]);
  });

  it('falls back to a standard font for WinAnsi characters a custom font lacks', () => {
    const { runs } = runsOf('日€', ['font:2', 'Helvetica']);
    expect(runs).toEqual([
      { text: '日', font: 'font:2' },
      { text: '€', font: 'Helvetica' },
    ]);
  });

  it('keeps a character no font has in the first custom font and reports it as missing', () => {
    const { runs, shaped } = runsOf('a☃b', ['font:0', 'Helvetica']);
    expect(runs).toEqual([{ text: 'a☃b', font: 'font:0' }]);
    expect(shaped.missing).toEqual(['☃']);
    expect(shaped.replaced).toEqual([]);
  });

  it('replaces a character no font has with ? when the chain starts with a standard font', () => {
    const { runs, shaped } = runsOf('a☃', ['Helvetica', 'font:2']);
    expect(runs).toEqual([{ text: 'a?', font: 'Helvetica' }]);
    expect(shaped.replaced).toEqual(['☃']);
  });

  it('keeps a grapheme cluster together in one font', () => {
    // e + combining acute: font:0 has both; a surrogate pair stays whole too.
    const { runs, shaped } = runsOf('e\u0301𝒜', ['font:0', 'font:2']);
    expect(runs).toEqual([{ text: 'e\u0301𝒜', font: 'font:0' }]);
    expect(shaped.missing).toEqual(['𝒜']);
    expect(shaped.clusterStarts).toEqual([0, 2, 4]);
  });

  it('maps space separators and drops invisible characters for custom fonts too', () => {
    const { shaped } = runsOf('a\u2009b\u00adc', ['font:0']);
    expect(shaped.text).toBe('a bc');
  });
});
