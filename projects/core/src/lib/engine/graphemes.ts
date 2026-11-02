const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Whether every code unit of `text` is a whole character: below U+0300, no marks or surrogates. */
export function isSimple(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) >= 0x300) return false;
  return true;
}

/** Where each grapheme cluster of `text` starts, the way `letter-spacing` counts characters. */
export function graphemeStarts(text: string): number[] {
  if (isSimple(text)) return Array.from({ length: text.length }, (_, index) => index);
  return Array.from(segmenter.segment(text), (segment) => segment.index);
}

/** The number of grapheme clusters in `text`. */
export function graphemeCount(text: string): number {
  return isSimple(text) ? text.length : graphemeStarts(text).length;
}
