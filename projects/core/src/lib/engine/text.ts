import LineBreaker from 'linebreak';
import type { Color } from './color';
import { covers, fontFor, normalizeText, shapeText, SOFT_HYPHEN } from './fonts';
import { graphemeCount } from './graphemes';
import type { TextStyle } from './style';
import type { FontMetrics, FontName } from './writer';

/** A piece of a line drawn in one font, size, color and decoration. */
export interface TextRun {
  readonly text: string;
  readonly font: FontName;
  readonly size: number;
  readonly color: Color;
  readonly decoration: TextStyle['textDecoration'];
  /** Points after each character, included in `width`. */
  readonly letterSpacing: number;
  /** Offset from the start of the line. */
  readonly x: number;
  readonly width: number;
  /** Height of the font above its baseline. */
  readonly ascent: number;
  /** The URL of the pdf-link the run belongs to, or `#name` for one to an anchor. */
  readonly link?: string;
}

export interface TextLine {
  readonly text: string;
  readonly width: number;
  /** Top of the line box. */
  readonly y: number;
  /** The tallest run's font size times the paragraph's line height. */
  readonly height: number;
  /** The baseline, below `y`: the largest ascent of the line's runs. */
  readonly ascent: number;
  /** The paragraph's last line, which `text-align: justify` leaves at the start. */
  readonly last: boolean;
  readonly runs: readonly TextRun[];
}

/** The fonts of a text, from `fontChain`. Without it, text is drawn in one standard font. */
export interface TextFonts {
  readonly chain: readonly FontName[];
  /** Receives the characters no font in the chain has. */
  readonly missing?: (chars: string[]) => void;
}

/** A piece of a paragraph in one text style, such as the text of a pdf-span. */
export interface TextRange {
  readonly text: string;
  readonly style: TextStyle;
  readonly fonts?: TextFonts;
  /** The checked URL of the pdf-link the range is in, or `#name` for one to an anchor. */
  readonly link?: string;
}

/** What applies to a paragraph as a whole: its line height and an optional line limit. */
export type ParagraphStyle = TextStyle & {
  /** The most lines kept; the last ends in an ellipsis when text was cut. */
  readonly maxLines?: number | null;
};

export interface TextBlock {
  readonly lines: readonly TextLine[];
  readonly width: number;
  readonly height: number;
}

/** The word gaps in `text` that justified text widens: runs of spaces and no-break spaces, as in CSS. */
export function wordGaps(text: string): number {
  return text.match(/[ \u00a0]+/g)?.length ?? 0;
}

const MAX_TEXT_LENGTH = 1_048_576;
// yoga-layout's MeasureMode.Undefined: no width constraint.
const MEASURE_MODE_UNDEFINED = 0;
// How far over `maxWidth` the summed character widths may be and still be tried by measuring.
const KERNING_SLACK = 1.25;
const ELLIPSIS = '…';
// For a font without U+2026.
const ELLIPSIS_DOTS = '...';
// U+2010 HYPHEN, or the hyphen-minus in a font without it (every standard font: it is not WinAnsi).
const HYPHEN = '\u2010';
const HYPHEN_MINUS = '-';
// As browsers do by default: words of 5 letters or more, at least 2 letters on each side.
const HYPHENATE_MIN_WORD = 5;
const HYPHENATE_MIN_SIDE = 2;

/**
 * The app's hyphenation function: the word cut into pieces that join back to it, such as
 * `['hy', 'phen', 'ation']`. `language` is the document's `language`.
 */
export type Hyphenate = (word: string, language: string | undefined) => readonly string[];

/** What `hyphens: auto` needs from the render. */
export interface TextHyphenation {
  readonly hyphenate?: Hyphenate;
  /** The document's language, passed to `hyphenate`. */
  readonly language?: string;
  /** Dev-mode warnings: a missing or failing hyphenation function. */
  readonly warn?: (message: string) => void;
}

function assertTextSize(ranges: readonly TextRange[]): void {
  let length = 0;
  for (const range of ranges) length += range.text.length;
  if (length > MAX_TEXT_LENGTH) throw new Error('ngpdf: text longer than 1 MB');
}

interface CachedBlock {
  readonly block: TextBlock;
  /** Characters replaced by `?`, reported again each time the block is used. */
  readonly replaced: readonly string[];
  /** Characters no font has, reported the same way. */
  readonly missing: readonly string[];
}

/**
 * Text measuring reused within one render. `renderDocument` creates one and passes it down in
 * `LayoutContext`, as it does `metrics` and `images`, so renders share nothing. Its contents are
 * private: callers can only create one and hand it to `layoutText` and `measureText`.
 */
export class TextMeasureCache {
  /** Laid-out blocks, by text, then by font, size, line height and width. */
  readonly #blocks = new Map<string, Map<string, CachedBlock>>();
  /** Drawn widths, by font and size, then by string. */
  readonly #widths = new Map<string, Map<string, number>>();
  readonly #hyphenation: TextHyphenation;
  /** Where each word asked about may break, as offsets in it; empty when it may not. */
  readonly #hyphenPoints = new Map<string, readonly number[]>();
  #warnedBadWord = false;

  /** `hyphenation` holds the render's hyphenation function, called through `hyphenPoints`. */
  constructor(hyphenation: TextHyphenation = {}) {
    this.#hyphenation = hyphenation;
  }

  /** Whether `hyphens: auto` can ask a function; warns (once per message) when it cannot. */
  canHyphenate(): boolean {
    if (this.#hyphenation.hyphenate) return true;
    this.#hyphenation.warn?.(
      'ngpdf: hyphens: auto needs providePdfHyphenation; words break only at soft hyphens',
    );
    return false;
  }

  /**
   * The offsets in `word` where the hyphenation function allows a break, asked once per word. A
   * throw, or pieces that do not join back to the word, give none, with one warning per render.
   */
  hyphenPoints(word: string): readonly number[] {
    let points = this.#hyphenPoints.get(word);
    if (!points) {
      points = this.#askHyphenate(word);
      this.#hyphenPoints.set(word, points);
    }
    return points;
  }

  #askHyphenate(word: string): readonly number[] {
    const { hyphenate, language } = this.#hyphenation;
    if (!hyphenate) return [];
    let pieces: unknown;
    try {
      pieces = hyphenate(word, language);
    } catch {
      pieces = undefined;
    }
    const points: number[] = [];
    let joined = '';
    if (Array.isArray(pieces)) {
      for (const piece of pieces as unknown[]) {
        if (typeof piece !== 'string') {
          joined = '';
          break;
        }
        joined += piece;
        points.push(joined.length);
      }
    }
    if (joined !== word) {
      if (!this.#warnedBadWord) {
        this.#warnedBadWord = true;
        this.#hyphenation.warn?.(
          `ngpdf: the hyphenation function failed or returned pieces that are not the word, for "${word}"; words it fails on are not hyphenated`,
        );
      }
      return [];
    }
    // The end of the word is not a break inside it.
    points.pop();
    return points.filter((point) => point > 0);
  }

  /** The block for `text` under `key`, made with `make` the first time. */
  block(text: string, key: string, make: () => CachedBlock): CachedBlock {
    let byKey = this.#blocks.get(text);
    if (!byKey) {
      byKey = new Map();
      this.#blocks.set(text, byKey);
    }
    let cached = byKey.get(key);
    if (!cached) {
      cached = make();
      byKey.set(key, cached);
    }
    return cached;
  }

  /**
   * `metrics.widthOf` for one font and size, remembering every string it measures. Without
   * `ligatures`, as letter-spaced text is measured, the optional ligatures are left out.
   */
  widthOf(
    metrics: FontMetrics,
    font: FontName,
    size: number,
    ligatures = true,
  ): (chunk: string) => number {
    const fontKey = `${font} ${String(size)}${ligatures ? '' : ' no-ligatures'}`;
    let widths = this.#widths.get(fontKey);
    if (!widths) {
      widths = new Map();
      this.#widths.set(fontKey, widths);
    }
    const known = widths;
    return (chunk) => {
      let width = known.get(chunk);
      if (width === undefined) {
        width = ligatures
          ? metrics.widthOf(chunk, font, size)
          : metrics.widthOf(chunk, font, size, false);
        known.set(chunk, width);
      }
      return width;
    };
  }
}

/**
 * CSS `white-space: normal` over a paragraph split into pieces: runs of space, tab and line breaks
 * become one space, also across pieces (the space stays in the piece where the run starts), and the
 * ends of the whole paragraph are trimmed. Returns one string per piece.
 */
function collapseWhitespace(pieces: readonly string[]): string[] {
  let spaceBefore = false;
  const collapsed = pieces.map((piece) => {
    let out = piece.replace(/[ \t\r\n]+/g, ' ');
    if (spaceBefore && out.startsWith(' ')) out = out.slice(1);
    if (out !== '') spaceBefore = out.endsWith(' ');
    return out;
  });
  const whole = collapsed.join('');
  const start = whole.length - whole.trimStart().length;
  const end = whole.trimEnd().length;
  let offset = 0;
  return collapsed.map((piece) => {
    const from = offset;
    offset += piece.length;
    return piece.slice(Math.max(0, start - from), Math.max(0, end - from));
  });
}

/**
 * CSS `text-transform` over the collapsed pieces of a paragraph, each in its own range's transform.
 * A word starts at the paragraph start or after whitespace, across pieces. `capitalize` uppercases
 * a word's first letter, skipping punctuation before it; a word that starts with a digit stays.
 */
function transformText(
  pieces: readonly string[],
  transforms: readonly TextStyle['textTransform'][],
): string[] {
  if (transforms.every((transform) => transform === 'none')) return [...pieces];
  let wordStart = true;
  return pieces.map((piece, i) => {
    const transform = transforms[i] ?? 'none';
    let out = '';
    for (const char of piece) {
      let drawn = char;
      if (/\s/u.test(char)) wordStart = true;
      else if (/[\p{L}\p{N}]/u.test(char)) {
        if (transform === 'capitalize' && wordStart) drawn = char.toUpperCase();
        wordStart = false;
      }
      if (transform === 'uppercase') drawn = char.toUpperCase();
      else if (transform === 'lowercase') drawn = char.toLowerCase();
      out += drawn;
    }
    return out;
  });
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
  cache: TextMeasureCache = new TextMeasureCache(),
  fonts?: TextFonts,
): TextBlock {
  return layoutRanges(
    [{ text, style, ...(fonts && { fonts }) }],
    style,
    maxWidth,
    metrics,
    warn,
    cache,
  );
}

/** A font at one size, color and decoration, and the run's link: what a run is drawn in. */
interface Face {
  readonly font: FontName;
  readonly size: number;
  readonly color: Color;
  readonly decoration: TextStyle['textDecoration'];
  readonly letterSpacing: number;
  readonly ascent: number;
  readonly link?: string;
}

/** What a range contributes to the cache key: its length and everything its faces depend on. */
function rangeKey(range: TextRange): string {
  const { fontSize, color, textDecoration, letterSpacing, textTransform, hyphens } = range.style;
  const chain = range.fonts?.chain ?? [fontFor(range.style)];
  return `${String(range.text.length)}:${chain.join(',')}:${String(fontSize)}:${String(color.r)},${String(color.g)},${String(color.b)},${String(color.a)}:${textDecoration}:${String(letterSpacing)}:${textTransform}:${hyphens}:${range.link ?? ''}`;
}

/** The text, faces and per-unit face index of a paragraph, each range shaped in its own chain. */
interface ShapedRanges {
  readonly text: string;
  readonly faces: readonly Face[];
  readonly faceAt: Uint16Array;
  readonly clusterStarts?: readonly number[];
  readonly replaced: readonly string[];
  readonly missing: readonly string[];
  /** Where a word may break at a soft hyphen: offsets in `text`, in order, inside the text. */
  readonly softBreaks: readonly number[];
  /** 1 for each unit of `text` in a range with `hyphens: auto`; undefined when there is none. */
  readonly autoAt?: Uint8Array;
}

/**
 * Drops each soft hyphen next to whitespace (across pieces too) or at the paragraph's ends, so
 * none sits between spaces that collapse, or at an end where it could never break.
 */
function dropLooseSoftHyphens(pieces: readonly string[]): string[] {
  const whole = pieces.join('');
  if (!whole.includes(SOFT_HYPHEN)) return [...pieces];
  const loose = (char: string | undefined): boolean =>
    char === undefined || char === ' ' || char === '\t' || char === '\r' || char === '\n';
  // A soft hyphen and a space are one UTF-16 unit each, so units are enough here.
  const keep = new Uint8Array(whole.length).fill(1);
  // The nearest unit before each soft hyphen that is not one, then the nearest after it.
  const before: (string | undefined)[] = [];
  let last: string | undefined;
  for (let i = 0; i < whole.length; i++) {
    const unit = whole.charAt(i);
    before.push(last);
    if (unit !== SOFT_HYPHEN) last = unit;
  }
  let next: string | undefined;
  for (let i = whole.length - 1; i >= 0; i--) {
    const unit = whole.charAt(i);
    if (unit !== SOFT_HYPHEN) next = unit;
    else if (loose(before[i]) || loose(next)) keep[i] = 0;
  }
  let offset = 0;
  return pieces.map((piece) => {
    let out = '';
    for (let i = 0; i < piece.length; i++) if (keep[offset + i]) out += piece.charAt(i);
    offset += piece.length;
    return out;
  });
}

function shapeRanges(ranges: readonly TextRange[], metrics: FontMetrics): ShapedRanges {
  const faces: Face[] = [];
  const faceIndex = new Map<string, number>();
  const faceOf = (font: FontName, style: TextStyle, link: string | undefined): number => {
    const { fontSize: size, color, textDecoration: decoration, letterSpacing } = style;
    const key = `${font}:${String(size)}:${String(color.r)},${String(color.g)},${String(color.b)},${String(color.a)}:${decoration}:${String(letterSpacing)}:${link ?? ''}`;
    let index = faceIndex.get(key);
    if (index === undefined) {
      index = faces.length;
      const ascent = metrics.ascent(font, size);
      faces.push({
        font,
        size,
        color,
        decoration,
        letterSpacing,
        ascent,
        ...(link !== undefined && { link }),
      });
      faceIndex.set(key, index);
    }
    return index;
  };

  // Soft hyphens are kept through collapsing and transforming, and shaping takes them out.
  const pieces = transformText(
    collapseWhitespace(
      dropLooseSoftHyphens(ranges.map((range) => normalizeText(range.text, true))),
    ),
    ranges.map((range) => range.style.textTransform),
  );
  const shapedPieces = ranges.map((range, i) => {
    const chain = range.fonts?.chain ?? [fontFor(range.style)];
    // Registered in chain order, so for a single range a face index is its chain index.
    const toFace = chain.map((font) => faceOf(font, range.style, range.link));
    return { range, shaped: shapeText(pieces[i] ?? '', chain, metrics), toFace };
  });

  const nonEmpty = shapedPieces.filter(({ shaped }) => shaped.text !== '');
  const [only] = nonEmpty;
  if (nonEmpty.length === 1 && only?.toFace.every((face, i) => face === i)) {
    const { hyphens } = only.range.style;
    return {
      ...only.shaped,
      faces,
      faceAt: only.shaped.fontAt,
      softBreaks:
        hyphens === 'none' ? [] : softBreaksIn(only.shaped.softHyphens, 0, only.shaped.text.length),
      ...(hyphens === 'auto' && { autoAt: new Uint8Array(only.shaped.text.length).fill(1) }),
    };
  }

  let text = '';
  const faceAt: number[] = [];
  const replaced = new Set<string>();
  const missing = new Set<string>();
  const anyClusters = nonEmpty.some(({ shaped }) => shaped.clusterStarts);
  const clusterStarts: number[] = [];
  const softHyphens: number[] = [];
  const anyAuto = nonEmpty.some(({ range }) => range.style.hyphens === 'auto');
  const autoSpans: [number, number][] = [];
  for (const { range, shaped, toFace } of nonEmpty) {
    const offset = text.length;
    if (range.style.hyphens !== 'none') {
      for (const at of shaped.softHyphens) softHyphens.push(offset + at);
    }
    if (range.style.hyphens === 'auto') autoSpans.push([offset, offset + shaped.text.length]);
    if (anyClusters) {
      const starts = shaped.clusterStarts;
      const count = starts ? starts.length - 1 : shaped.text.length;
      for (let k = 0; k < count; k++) clusterStarts.push(offset + (starts ? (starts[k] ?? 0) : k));
    }
    for (const index of shaped.fontAt) faceAt.push(toFace[index] ?? 0);
    text += shaped.text;
    for (const char of shaped.replaced) replaced.add(char);
    for (const char of shaped.missing) missing.add(char);
  }
  if (anyClusters) clusterStarts.push(text.length);
  return {
    text,
    faces,
    faceAt: Uint16Array.from(faceAt),
    ...(anyClusters && { clusterStarts }),
    replaced: [...replaced],
    missing: [...missing],
    softBreaks: softBreaksIn(softHyphens, 0, text.length),
    ...(anyAuto && {
      autoAt: autoSpans.reduce(
        (at, [from, to]) => at.fill(1, from, to),
        new Uint8Array(text.length),
      ),
    }),
  };
}

/** The soft hyphen offsets strictly inside `(from, to)`, each once. */
function softBreaksIn(offsets: readonly number[], from: number, to: number): number[] {
  const breaks: number[] = [];
  for (const at of offsets) {
    if (at > from && at < to && breaks.at(-1) !== at) breaks.push(at);
  }
  return breaks;
}

/**
 * `layoutText` for a paragraph made of ranges in different styles, such as text with pdf-spans.
 * The paragraph breaks as one text, so a range boundary is not a break opportunity; each range is
 * measured in its own fonts and size. `paragraph` gives the line height and the line limit.
 */
export function layoutRanges(
  ranges: readonly TextRange[],
  paragraph: ParagraphStyle,
  maxWidth: number,
  metrics: FontMetrics,
  warn: (chars: string[]) => void = () => undefined,
  cache: TextMeasureCache = new TextMeasureCache(),
): TextBlock {
  assertTextSize(ranges);
  const text = ranges.length === 1 ? (ranges[0]?.text ?? '') : ranges.map((r) => r.text).join('');
  const maxLines = paragraph.maxLines ?? Infinity;
  const key = `${ranges.map(rangeKey).join(';')} ${String(paragraph.lineHeight)} ${String(maxWidth)} ${String(maxLines)}`;
  const { block, replaced, missing } = cache.block(text, key, () => {
    const shaped = shapeRanges(ranges, metrics);
    const widthOfs = shaped.faces.map((face) => {
      const spacing = face.letterSpacing;
      if (!spacing) return cache.widthOf(metrics, face.font, face.size);
      const widthOf = cache.widthOf(metrics, face.font, face.size, false);
      return (chunk: string) => widthOf(chunk) + spacing * graphemeCount(chunk);
    });
    const ellipses = shaped.faces.map((face) =>
      covers(face.font, ELLIPSIS, metrics) ? ELLIPSIS : ELLIPSIS_DOTS,
    );
    const hyphens = shaped.faces.map((face) =>
      covers(face.font, HYPHEN, metrics) ? HYPHEN : HYPHEN_MINUS,
    );
    const hyphenPoints =
      shaped.autoAt && cache.canHyphenate()
        ? (word: string) => cache.hyphenPoints(word)
        : undefined;
    return {
      block: breakLines(shaped, paragraph.lineHeight, maxWidth, widthOfs, maxLines, ellipses, {
        glyphs: hyphens,
        ...(hyphenPoints && { points: hyphenPoints }),
      }),
      replaced: shaped.replaced,
      missing: shaped.missing,
    };
  });
  if (replaced.length > 0) warn([...replaced]);
  if (missing.length > 0)
    ranges.find((range) => range.fonts?.missing)?.fonts?.missing?.([...missing]);
  return block;
}

/** How a line may end inside a word. */
interface LineHyphenation {
  /** The hyphen each face draws at the end of a hyphenated line. */
  readonly glyphs: readonly string[];
  /** The hyphenation function's break offsets in a word, for `hyphens: auto` text. */
  readonly points?: (word: string) => readonly number[];
}

/**
 * The lines of the shaped text in `maxWidth`; see `layoutText`. Past `maxLines`, the last line is
 * shortened until its text plus the ellipsis of its last face fits.
 */
function breakLines(
  shaped: ShapedRanges,
  lineHeight: number,
  maxWidth: number,
  widthOfs: readonly ((chunk: string) => number)[],
  maxLines: number,
  ellipses: readonly string[],
  hyphenation: LineHyphenation,
): TextBlock {
  const { text: collapsed, faces, faceAt: fontAt, clusterStarts, softBreaks, autoAt } = shaped;
  const length = collapsed.length;
  const widthIn = (font: number, chunk: string): number => (widthOfs[font] ?? (() => 0))(chunk);

  // Where a word may be cut at the box edge: between grapheme clusters, or anywhere when every
  // unit is its own cluster.
  const cut = clusterStarts ? (k: number) => clusterStarts[k] ?? length : (k: number) => k;
  const cutIndex = clusterStarts
    ? (position: number) => lastWhere(0, clusterStarts.length - 1, (k) => cut(k) <= position)
    : (position: number) => position;

  // prefix[i] is the summed width of the clusters that end by unit i; a cluster's width sits on
  // its last unit.
  const prefix = new Float64Array(length + 1);
  for (let k = 0; cut(k) < length; k++) {
    const from = cut(k);
    const to = cut(k + 1);
    for (let i = from + 1; i < to; i++) prefix[i] = prefix[from] ?? 0;
    prefix[to] = (prefix[from] ?? 0) + widthIn(fontAt[from] ?? 0, collapsed.slice(from, to));
  }
  const breaks = length === 0 ? [] : breakPositions(collapsed);

  /** `[start, end)` split where the face changes, each piece measured in its own face. */
  const runsOf = (start: number, end: number): TextRun[] => {
    const runs: TextRun[] = [];
    let x = 0;
    for (let from = start; from < end;) {
      const index = fontAt[from] ?? 0;
      let to = from + 1;
      while (to < end && fontAt[to] === index) to++;
      const text = collapsed.slice(from, to);
      const width = widthIn(index, text);
      const face = faces[index] ?? faces[0];
      if (face) runs.push({ ...face, text, x, width });
      x += width;
      from = to;
    }
    return runs;
  };
  const widthOfRange = (start: number, end: number): number =>
    runsOf(start, end).reduce((sum, run) => sum + run.width, 0);

  /** `end` without the spaces before it, down to `start`. */
  const keptEnd = (start: number, end: number): number => {
    let kept = end;
    while (kept > start && collapsed.charCodeAt(kept - 1) === 32) kept--;
    return kept;
  };
  /** The face the ellipsis takes after `[start, end)`: its last kept character's, or `fallback`. */
  const ellipsisFace = (start: number, end: number, fallback: number): number => {
    const kept = keptEnd(start, end);
    return kept > start ? (fontAt[kept - 1] ?? fallback) : fallback;
  };
  /** The runs of `[start, end)` without its trailing spaces, then the ellipsis in face `index`. */
  const runsWithEllipsis = (start: number, end: number, index: number): TextRun[] => {
    const kept = keptEnd(start, end);
    const runs = runsOf(start, kept);
    const ellipsis = ellipses[index] ?? ELLIPSIS;
    const face = faces[index] ?? faces[0];
    const last = runs.at(-1);
    if (last && fontAt[kept - 1] === index) {
      const text = last.text + ellipsis;
      runs[runs.length - 1] = { ...last, text, width: widthIn(index, text) };
    } else if (face) {
      const x = last ? last.x + last.width : 0;
      runs.push({ ...face, text: ellipsis, x, width: widthIn(index, ellipsis) });
    }
    return runs;
  };

  /** The runs of `[start, end)`, then the hyphen of the face of its last character. */
  const runsWithHyphen = (start: number, end: number): TextRun[] => {
    const runs = runsOf(start, end);
    const last = runs.at(-1);
    const index = fontAt[end - 1] ?? 0;
    if (last) {
      const text = last.text + (hyphenation.glyphs[index] ?? HYPHEN_MINUS);
      runs[runs.length - 1] = { ...last, text, width: widthIn(index, text) };
    }
    return runs;
  };

  // Where each word (`[from, to)` between break opportunities) may end a line with a hyphen.
  const pointsByWord = new Map<number, readonly number[]>();
  const autoPoints = (from: number, to: number): number[] => {
    const points: number[] = [];
    const ask = hyphenation.points;
    if (!ask || !autoAt) return points;
    for (const match of collapsed.slice(from, to).matchAll(/[\p{L}\p{M}]+/gu)) {
      const word = match[0];
      const at = from + match.index;
      const letters = graphemeCount(word);
      if (letters < HYPHENATE_MIN_WORD) continue;
      for (const point of ask(word)) {
        const lettersBefore = graphemeCount(word.slice(0, point));
        if (lettersBefore < HYPHENATE_MIN_SIDE || letters - lettersBefore < HYPHENATE_MIN_SIDE)
          continue;
        // Never inside a grapheme cluster: before a combining mark or a surrogate pair's second half.
        if (graphemeCount(word.slice(point - 1, point + 1)) < 2) continue;
        if (autoAt[at + point - 1] && autoAt[at + point]) points.push(at + point);
      }
    }
    return points;
  };
  const hyphenPointsOf = (from: number, to: number): readonly number[] => {
    let points = pointsByWord.get(from);
    if (!points) {
      const first =
        lastWhere(0, softBreaks.length - 1, (i) => (softBreaks[i] ?? length) <= from) + 1;
      const manual: number[] = [];
      for (let i = first; i < softBreaks.length && (softBreaks[i] ?? length) < to; i++) {
        manual.push(softBreaks[i] ?? length);
      }
      // A word with soft hyphens breaks only at them, as in CSS.
      points = manual.length > 0 ? manual : autoPoints(from, to);
      pointsByWord.set(from, points);
    }
    return points;
  };

  /** The end of the text to draw for a line `[start, end)`: a trailing space is not drawn. */
  const drawnEnd = (end: number): number => (collapsed.charCodeAt(end - 1) === 32 ? end - 1 : end);
  const guess = (start: number, end: number): number =>
    (prefix[drawnEnd(end)] ?? 0) - (prefix[start] ?? 0);
  const measure = (start: number, end: number): number => widthOfRange(start, drawnEnd(end));
  const fits = (start: number, end: number): boolean => measure(start, end) <= maxWidth;

  /** The largest end in `[low, high]` that fits, given that `low` fits and `high` does not. */
  const narrow = (low: number, high: number, endOf: (index: number) => number, start: number) =>
    endOf(lastWhere(low, high - 1, (index) => fits(start, endOf(index))));

  // Kerning mostly narrows text, so a line can hold a little more than its character sum says.
  const guessLimit = maxWidth * KERNING_SLACK;

  const lines: TextLine[] = [];
  let top = 0;
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

    // The word that does not fit: the line ends inside it, with a hyphen, if a piece fits.
    let hyphenated = false;
    if (end < length && (softBreaks.length > 0 || autoAt)) {
      const from = end < 0 ? start : end;
      let next = nextBreak;
      while ((breaks[next] ?? length) <= from) next++;
      const wordStart = next > 0 ? (breaks[next - 1] ?? 0) : 0;
      const wordEnd = breaks[next] ?? length;
      const points = hyphenPointsOf(wordStart, wordEnd);
      const lastFitting = lastWhere(0, points.length - 1, (i) => {
        const point = points[i] ?? length;
        return (
          point <= from ||
          runsWithHyphen(start, point).reduce((sum, run) => sum + run.width, 0) <= maxWidth
        );
      });
      const point = points[lastFitting];
      if (point !== undefined && point > from) {
        end = point;
        hyphenated = true;
      }
    }

    if (end < 0) {
      // The first word is wider than the box: split it after the last cluster that fits.
      const first = cutIndex(start);
      const lastCut = lastWhere(
        first + 1,
        cutIndex(firstEnd),
        (k) => guess(start, cut(k)) <= guessLimit,
      );
      const guessCut = Math.max(lastCut, first + 1);
      const guessEnd = cut(guessCut);
      if (fits(start, guessEnd) || guessCut === first + 1) end = guessEnd;
      else if (fits(start, cut(first + 1))) end = narrow(first + 1, guessCut, cut, start);
      else end = cut(first + 1);
    }

    let runs = hyphenated ? runsWithHyphen(start, end) : runsOf(start, drawnEnd(end));
    // The paragraph's ends are trimmed, so anything after `end` is text that gets cut.
    const clamped = lines.length + 1 >= maxLines && end < length;
    if (clamped) {
      const fallback = fontAt[drawnEnd(end) - 1] ?? 0;
      const widthWith = (k: number, face: number): number =>
        runsWithEllipsis(start, cut(k), face).reduce((sum, run) => sum + run.width, 0);
      // The ellipsis takes the face of the last kept character, so a cut that ends in a smaller
      // face can fit where a shorter one did not. With the face fixed, width only grows with the
      // cut, so each face gets its own search over the cuts that end in it.
      const cutsByFace = new Map<number, number[]>();
      for (let k = cutIndex(start); k <= cutIndex(drawnEnd(end)); k++) {
        const face = ellipsisFace(start, cut(k), fallback);
        const cuts = cutsByFace.get(face) ?? [];
        cuts.push(k);
        cutsByFace.set(face, cuts);
      }
      let best = -1;
      let bestFace = fallback;
      for (const [face, cuts] of cutsByFace) {
        const i = lastWhere(0, cuts.length - 1, (j) => widthWith(cuts[j] ?? 0, face) <= maxWidth);
        const k = cuts[i] ?? -1;
        if (k > best) [best, bestFace] = [k, face];
      }
      // A box narrower than the ellipsis gets an empty line rather than one that overflows.
      runs = best >= 0 ? runsWithEllipsis(start, cut(best), bestFace) : [];
    }
    // An empty cut line keeps the height of the text it replaces.
    const sized = runs.length > 0 ? runs : runsOf(start, drawnEnd(end));
    let size = 0;
    let ascent = 0;
    for (const run of sized) {
      size = Math.max(size, run.size);
      ascent = Math.max(ascent, run.ascent);
    }
    const height = size * lineHeight;
    lines.push({
      text: runs.map((run) => run.text).join(''),
      width: runs.reduce((sum, run) => sum + run.width, 0),
      y: top,
      height,
      ascent,
      // The text is trimmed, so only the last line reaches its end.
      last: end === length || clamped,
      runs,
    });
    top += height;
    if (clamped) break;
    start = end;
  }

  return {
    lines,
    width: lines.reduce((widest, line) => Math.max(widest, line.width), 0),
    height: top,
  };
}

/** A Yoga measure function (`node.setMeasureFunc`) for the text. */
export function measureText(
  text: string,
  style: TextStyle,
  metrics: FontMetrics,
  cache: TextMeasureCache = new TextMeasureCache(),
  fonts?: TextFonts,
): (width: number, widthMode: number) => { width: number; height: number } {
  return measureRanges([{ text, style, ...(fonts && { fonts }) }], style, metrics, cache);
}

/** `measureText` for a paragraph made of ranges; see `layoutRanges`. */
export function measureRanges(
  ranges: readonly TextRange[],
  paragraph: ParagraphStyle,
  metrics: FontMetrics,
  cache: TextMeasureCache = new TextMeasureCache(),
): (width: number, widthMode: number) => { width: number; height: number } {
  assertTextSize(ranges);
  // Warnings are left to the layout that draws the text.
  const quiet = ranges.map(({ text, style, fonts }) => ({
    text,
    style,
    ...(fonts && { fonts: { chain: fonts.chain } }),
  }));
  return (width, widthMode) => {
    const maxWidth = widthMode === MEASURE_MODE_UNDEFINED ? Infinity : width;
    const block = layoutRanges(quiet, paragraph, maxWidth, metrics, undefined, cache);
    return { width: block.width, height: block.height };
  };
}
