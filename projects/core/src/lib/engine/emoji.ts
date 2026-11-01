import type { PdfNode } from '../tree/node';
import { isSimple } from './graphemes';
import { readSource, type ImageAsset } from './images';
import type { PdfWriter } from './writer';

/** An emoji image: a URL, a data URL or the bytes of a PNG or JPEG. */
export type EmojiImage = string | Uint8Array | Blob | ArrayBuffer;

/**
 * Where emoji images come from: a URL template with `{codepoints}`, or a function given the
 * emoji and its code points that returns the image, or null to draw that emoji as text.
 */
export type EmojiSource =
  string | ((emoji: string, codepoints: string) => EmojiImage | null | Promise<EmojiImage | null>);

/** The most distinct emoji one render loads; the rest stay text. */
export const MAX_EMOJI = 500;

/** How long one emoji's image may take, from asking the source to reading the bytes. */
export const EMOJI_TIMEOUT_MS = 10_000;

const VS15 = 0xfe0e;
const VS16 = 0xfe0f;
const ZWJ = 0x200d;
const KEYCAP = 0x20e3;
const isKeycapBase = (codePoint: number): boolean =>
  (codePoint >= 0x30 && codePoint <= 0x39) || codePoint === 0x23 || codePoint === 0x2a;

/**
 * Whether a grapheme cluster has an emoji presentation: it has U+FE0F, is a ZWJ sequence, a keycap
 * or a modifier sequence (a base such as ✌ with a skin tone), or starts with an
 * `Emoji_Presentation` character not followed by U+FE0E. Flags (regional indicator pairs) and tag
 * sequences (🏴 and tags) start with one. `©`, `®`, `™` and the digits stay text unless U+FE0F
 * follows them.
 */
export function isEmoji(cluster: string): boolean {
  const codePoints = Array.from(cluster, (char) => char.codePointAt(0) ?? 0);
  const [first = 0, second] = codePoints;
  if (second === VS15) return false;
  if (codePoints.includes(VS16)) return true;
  if (codePoints.includes(ZWJ) && /^\p{Extended_Pictographic}/u.test(cluster)) return true;
  if (isKeycapBase(first) && codePoints.includes(KEYCAP)) return true;
  if (/^\p{Emoji_Modifier_Base}\p{Emoji_Modifier}/u.test(cluster)) return true;
  return /^\p{Emoji_Presentation}/u.test(cluster);
}

/**
 * The code points of an emoji in lower-case hex joined by `-`, without U+FE0F: `1f44d-1f3fd` for
 * 👍🏽. Image sets name files their own way, so an exact vendor naming needs a function source.
 */
export function emojiCodepoints(cluster: string): string {
  const out: string[] = [];
  for (const char of cluster) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint !== VS16) out.push(codePoint.toString(16));
  }
  return out.join('-');
}

/** The distinct emoji in the text under `root`, in document order. */
function emojiIn(root: PdfNode): string[] {
  const found = new Set<string>();
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const visit = (node: PdfNode): void => {
    if (node.kind === 'text') {
      // Every emoji has a code unit at U+0300 or above: U+FE0F, a surrogate or a symbol.
      if (isSimple(node.text)) return;
      for (const { segment } of segmenter.segment(node.text)) {
        if (isEmoji(segment)) found.add(segment);
      }
      return;
    }
    node.children.forEach(visit);
  };
  visit(root);
  return [...found];
}

async function loadOne(
  emoji: string,
  source: EmojiSource,
  writer: Pick<PdfWriter, 'imageSize' | 'checkImage'>,
  fetchFn: typeof fetch | undefined,
  signal: AbortSignal,
): Promise<ImageAsset | null> {
  const codepoints = emojiCodepoints(emoji);
  const image =
    typeof source === 'string'
      ? source.replaceAll('{codepoints}', codepoints)
      : await source(emoji, codepoints);
  if (image === null) return null;
  // The fetch is aborted when the emoji runs out of time.
  const base = fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const read = readSource(image, (input, init) => base(input, { ...init, signal }));
  if (!read) throw new Error('not a string, Blob, ArrayBuffer or Uint8Array');
  const data = await read.read();
  const size = writer.imageSize(data);
  // A file cut off after its header still has a size; the writer would fail on it later.
  if (writer.checkImage && !(await writer.checkImage(data))) throw new Error('unreadable image');
  return { data, ...size };
}

/**
 * `loadOne` cut off after `EMOJI_TIMEOUT_MS`: a source or a fetch that never settles must not hold
 * the render. The timer is cleared as soon as the load settles.
 */
function loadInTime(
  emoji: string,
  source: EmojiSource,
  writer: Pick<PdfWriter, 'imageSize' | 'checkImage'>,
  fetchFn: typeof fetch | undefined,
): Promise<ImageAsset | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('timed out'));
    }, EMOJI_TIMEOUT_MS);
  });
  return Promise.race([
    loadOne(emoji, source, writer, fetchFn, controller.signal),
    deadline,
  ]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Loads one image per distinct emoji in the document's text, at most `MAX_EMOJI`, keyed by the
 * emoji. An emoji whose image is null, fails to load or takes longer than `EMOJI_TIMEOUT_MS` is
 * left out, so it is drawn as text, and one warning names them all: emoji usually come from user
 * data, so one should not fail a render.
 */
export async function loadEmoji(
  root: PdfNode,
  source: EmojiSource | undefined,
  writer: Pick<PdfWriter, 'imageSize' | 'checkImage'>,
  warn: (message: string) => void,
  fetchFn?: typeof fetch,
): Promise<ReadonlyMap<string, ImageAsset>> {
  if (source === undefined) return new Map();
  const found = emojiIn(root);
  if (found.length > MAX_EMOJI) {
    warn(`ngpdf: more than ${String(MAX_EMOJI)} distinct emoji; the rest are drawn as text`);
  }
  const loaded = await Promise.all(
    found.slice(0, MAX_EMOJI).map(async (emoji) => {
      try {
        return [emoji, await loadInTime(emoji, source, writer, fetchFn)] as const;
      } catch {
        return [emoji, null] as const;
      }
    }),
  );
  const images = new Map<string, ImageAsset>();
  const failed: string[] = [];
  for (const [emoji, asset] of loaded) {
    if (asset) images.set(emoji, asset);
    else failed.push(emoji);
  }
  if (failed.length > 0) {
    warn(`ngpdf: emoji without an image, drawn as text: ${failed.join(' ')}`);
  }
  return images;
}
