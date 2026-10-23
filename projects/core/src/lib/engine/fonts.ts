import type { TextStyle } from './style';
import type { StandardFont } from './writer';

const FONT_NAMES: Record<TextStyle['fontFamily'], readonly [string, string, string, string]> = {
  // normal, bold, italic, bold italic
  Helvetica: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  Times: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  Courier: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
};

export function fontFor(
  style: Pick<TextStyle, 'fontFamily' | 'fontWeight' | 'fontStyle'>,
): StandardFont {
  const index = (style.fontWeight === 'bold' ? 1 : 0) + (style.fontStyle === 'italic' ? 2 : 0);
  return FONT_NAMES[style.fontFamily][index] as StandardFont;
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

// Soft hyphen and zero-width space: invisible unless a line breaks there, and v0.1 never breaks at
// them, so they are dropped rather than drawn as a hyphen (WinAnsi 0xAD) or as `?`.
const isInvisible = (codePoint: number): boolean => codePoint === 0xad || codePoint === 0x200b;

/**
 * Maps Unicode space separators to U+0020 (or U+00A0 for the no-break ones), drops soft hyphens
 * and zero-width spaces, and replaces any other character outside WinAnsi with `?`, reporting each
 * distinct one once.
 */
export function toWinAnsi(text: string, warn: (chars: string[]) => void): string {
  const unsupported = new Set<string>();
  let out = '';
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (isInvisible(codePoint)) continue;
    if (isSpaceSeparator(codePoint)) {
      out += isNoBreakSpace(codePoint) ? '\u00A0' : ' ';
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
