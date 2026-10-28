import type { TextStyle } from './style';
import type { CustomFont, FontMetrics, FontName, StandardFont } from './writer';

type StandardFamily = 'Helvetica' | 'Times' | 'Courier';
type FaceStyle = Pick<TextStyle, 'fontFamily' | 'fontWeight' | 'fontStyle'>;

const FONT_NAMES: Record<StandardFamily, readonly [string, string, string, string]> = {
  // normal, bold, italic, bold italic
  Helvetica: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  Times: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  Courier: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
};

/** The standard family a CSS family name stands for, or undefined for any other name. */
function standardFamilyOf(name: string): StandardFamily | undefined {
  const text = name.toLowerCase();
  if (text.includes('courier') || text.includes('mono')) return 'Courier';
  if (text.includes('times') || (text.includes('serif') && !text.includes('sans'))) return 'Times';
  if (text.includes('helvetica') || text.includes('arial') || text.includes('sans')) {
    return 'Helvetica';
  }
  return undefined;
}

// In a list with a registered family, only these exact names stand for a standard font, so a
// web-font name such as "Open Sans" or "IBM Plex Mono" is skipped rather than read as Helvetica.
const STANDARD_NAMES: ReadonlyMap<string, StandardFamily> = new Map([
  ['helvetica', 'Helvetica'],
  ['arial', 'Helvetica'],
  ['sans-serif', 'Helvetica'],
  ['system-ui', 'Helvetica'],
  ['times', 'Times'],
  ['times new roman', 'Times'],
  ['times-roman', 'Times'],
  ['serif', 'Times'],
  ['courier', 'Courier'],
  ['courier new', 'Courier'],
  ['monospace', 'Courier'],
  ['ui-monospace', 'Courier'],
]);

function standardFont(family: StandardFamily, style: FaceStyle): StandardFont {
  const index = (style.fontWeight === 'bold' ? 1 : 0) + (style.fontStyle === 'italic' ? 2 : 0);
  return FONT_NAMES[family][index] as StandardFont;
}

/** The standard font for the whole `font-family` value: Helvetica unless it names another. */
export function fontFor(style: FaceStyle): StandardFont {
  return standardFont(standardFamilyOf(style.fontFamily) ?? 'Helvetica', style);
}

export const isStandardFont = (font: FontName): font is StandardFont => !font.startsWith('font:');

/** A registered face of one family. */
export interface RegisteredFace {
  readonly weight: 'normal' | 'bold';
  readonly style: 'normal' | 'italic';
  readonly font: CustomFont;
}

/** Registered faces by lower-cased family name. */
export type FontRegistry = ReadonlyMap<string, readonly RegisteredFace[]>;

/** The names in a CSS `font-family` list, unquoted, in order. Splitting is linear. */
export function parseFontFamily(value: string): string[] {
  const names: string[] = [];
  let current = '';
  let quote = '';
  for (const char of value) {
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ',') {
      names.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  names.push(current.trim());
  return names.filter((name) => name !== '');
}

function faceOf(
  faces: readonly RegisteredFace[],
  family: string,
  style: FaceStyle,
  warn: (message: string) => void,
): FontName {
  const exact = faces.find((f) => f.weight === style.fontWeight && f.style === style.fontStyle);
  if (exact) return exact.font;
  // No synthetic bold or italic: the closest real face, keeping the weight before the slant.
  const face =
    faces.find((f) => f.weight === style.fontWeight && f.style === 'normal') ??
    faces.find((f) => f.weight === 'normal' && f.style === 'normal') ??
    faces[0];
  // A family is registered with at least one face; the standard font only keeps the types honest.
  if (!face) return fontFor(style);
  warn(
    `ngpdf: font "${family}" has no ${faceName(style.fontWeight, style.fontStyle)} face; using its ${faceName(face.weight, face.style)} face`,
  );
  return face.font;
}

/** "bold italic", "bold", "italic" or "regular". */
const faceName = (weight: string, style: string): string =>
  [weight, style].filter((part) => part !== 'normal').join(' ') || 'regular';

/**
 * The fonts to draw a text style in, in order of preference. A list that names no registered
 * family maps to one standard font, exactly as before custom fonts. Otherwise registered families
 * and standard names keep their order, unknown names are skipped, and a standard font closes the
 * list if none is named, so WinAnsi characters a custom font lacks still have a font.
 */
export function fontChain(
  style: FaceStyle,
  fonts: FontRegistry,
  warn: (message: string) => void = () => undefined,
): readonly FontName[] {
  const names = parseFontFamily(style.fontFamily);
  if (!names.some((name) => fonts.has(name.toLowerCase()))) return [fontFor(style)];
  const chain: FontName[] = [];
  for (const name of names) {
    const faces = fonts.get(name.toLowerCase());
    const standard = faces ? undefined : STANDARD_NAMES.get(name.toLowerCase());
    const font = faces
      ? faceOf(faces, name, style, warn)
      : standard && standardFont(standard, style);
    if (font && !chain.includes(font)) chain.push(font);
  }
  if (!chain.some(isStandardFont)) chain.push(fontFor(style));
  return chain;
}

// Code points that Windows-1252 (PDF WinAnsiEncoding) has in the 0x80-0x9F block.
const CP1252_EXTRAS = new Set<number>();
for (const char of '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ') CP1252_EXTRAS.add(char.codePointAt(0) ?? 0);

function isWinAnsi(codePoint: number): boolean {
  return (
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    (codePoint >= 0xa0 && codePoint <= 0xff) ||
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    CP1252_EXTRAS.has(codePoint)
  );
}

// Locale data puts these in pipe output (U+202F before AM/PM, U+2009 or U+202F as a group
// separator). U+2007 and U+202F must not break (UAX #14 class GL), so they become U+00A0, which
// linebreak also treats as glue.
const isNoBreakSpace = (codePoint: number): boolean => codePoint === 0x2007 || codePoint === 0x202f;
const isSpaceSeparator = (codePoint: number): boolean =>
  (codePoint >= 0x2000 && codePoint <= 0x200a) || codePoint === 0x202f || codePoint === 0x205f;
// The ideographic space and the Ogham space mark have glyphs of their own in fonts for those
// scripts, so they stay as they are until a standard font has to draw them as a space.
const isWideSpace = (codePoint: number): boolean => codePoint === 0x1680 || codePoint === 0x3000;
// Vertical tab, form feed and the line and paragraph separators are whitespace to `trim()`, which
// collapseWhitespace uses, so they become a space too instead of `?` in WinAnsi.
const isOtherWhitespace = (codePoint: number): boolean =>
  codePoint === 0x0b || codePoint === 0x0c || codePoint === 0x2028 || codePoint === 0x2029;

// Soft hyphen, zero-width space and U+FEFF (a byte order mark, or the old zero-width no-break
// space): invisible unless a line breaks there, and ngpdf never breaks at them, so they are dropped
// rather than drawn as a hyphen (WinAnsi 0xAD) or as a missing glyph.
const isInvisible = (codePoint: number): boolean =>
  codePoint === 0xad || codePoint === 0x200b || codePoint === 0xfeff;

/**
 * Maps Unicode space separators, vertical tab, form feed and the line and paragraph separators to
 * U+0020 (or U+00A0 for the no-break spaces), and drops soft hyphens, zero-width spaces and U+FEFF.
 * Applies to every font.
 */
export function normalizeText(text: string): string {
  let out = '';
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (isInvisible(codePoint)) continue;
    if (isSpaceSeparator(codePoint)) out += isNoBreakSpace(codePoint) ? ' ' : ' ';
    else if (isOtherWhitespace(codePoint)) out += ' ';
    else out += char;
  }
  return out;
}

/**
 * `normalizeText`, then the ideographic space and the Ogham space mark become a space and any
 * other character outside WinAnsi becomes `?`, reporting each distinct one once. The text of a
 * standard font.
 */
export function toWinAnsi(text: string, warn: (chars: string[]) => void): string {
  const unsupported = new Set<string>();
  let out = '';
  for (const char of normalizeText(text)) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (isWideSpace(codePoint)) {
      out += ' ';
    } else if (isWinAnsi(codePoint)) {
      out += char;
    } else {
      unsupported.add(char);
      out += '?';
    }
  }
  if (unsupported.size > 0) warn([...unsupported]);
  return out;
}

export interface ShapedText {
  /** The text to draw: normalized, with `?` for what a standard first font cannot show. */
  readonly text: string;
  /** For each UTF-16 unit of `text`, the index in the chain of the font that draws it. */
  readonly fontAt: Uint16Array;
  /**
   * The offsets where grapheme clusters start, then `text.length`. Undefined when every unit is
   * one cluster, as in standard-font text.
   */
  readonly clusterStarts?: readonly number[];
  /** Characters replaced by `?`. */
  readonly replaced: readonly string[];
  /** Characters no font in the chain has, kept in the first font (drawn as its empty glyph). */
  readonly missing: readonly string[];
}

const isSpace = (cluster: string): boolean => cluster === ' ' || cluster === ' ';

/** Whether `font` has every character of `cluster`. */
export function covers(
  font: FontName,
  cluster: string,
  metrics: Pick<FontMetrics, 'hasGlyph'>,
): boolean {
  for (const char of cluster) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (isStandardFont(font) ? !isWinAnsi(codePoint) : !metrics.hasGlyph(font, codePoint)) {
      return false;
    }
  }
  return true;
}

/**
 * Assigns each grapheme cluster of `text` the first font in `chain` that has all of it. A space
 * stays in the font of the cluster before it, so spaces do not split runs.
 */
export function shapeText(
  text: string,
  chain: readonly FontName[],
  metrics: Pick<FontMetrics, 'hasGlyph'>,
): ShapedText {
  const normalized = normalizeText(text);
  const [first] = chain;
  if (chain.length === 1 && first && isStandardFont(first)) {
    // One standard font: every unit is its own cluster once outside-WinAnsi characters are `?`.
    let replaced: readonly string[] = [];
    const winAnsi = toWinAnsi(normalized, (chars) => {
      replaced = chars;
    });
    return { text: winAnsi, fontAt: new Uint16Array(winAnsi.length), replaced, missing: [] };
  }

  const replaced = new Set<string>();
  const missing = new Set<string>();
  const clusterStarts: number[] = [];
  const fonts: number[] = [];
  let out = '';
  let previous = -1;
  let previousFont: FontName | undefined;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const { segment } of segmenter.segment(normalized)) {
    let index =
      previousFont && isSpace(segment) && covers(previousFont, segment, metrics)
        ? previous
        : chain.findIndex((font) => covers(font, segment, metrics));
    let drawn = segment;
    if (index < 0) {
      index = 0;
      if (first && isStandardFont(first)) {
        if (isWideSpace(segment.codePointAt(0) ?? 0)) {
          drawn = ' ';
        } else {
          replaced.add(segment);
          drawn = '?';
        }
      } else {
        missing.add(segment);
      }
    }
    clusterStarts.push(out.length);
    // One entry per UTF-16 unit, so a surrogate pair gets two.
    fonts.push(...new Array<number>(drawn.length).fill(index));
    out += drawn;
    previous = index;
    previousFont = chain[index];
  }
  clusterStarts.push(out.length);
  return {
    text: out,
    fontAt: Uint16Array.from(fonts),
    clusterStarts,
    replaced: [...replaced],
    missing: [...missing],
  };
}
