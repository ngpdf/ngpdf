import { InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';

/** An emoji image: a URL, a data URL or the bytes of a PNG or JPEG. */
export type PdfEmojiImage = string | Uint8Array | Blob | ArrayBuffer;

/**
 * Where emoji images come from. A string is a URL template whose `{codepoints}` is filled with the
 * emoji's code points in lower-case hex joined by `-`, without U+FE0F (`1f44d-1f3fd` for 👍🏽, the
 * file naming of Twemoji and Noto). A function gets the emoji and those code points, and returns
 * its image, or null to draw that emoji as text.
 */
export type PdfEmojiSource =
  | string
  | ((emoji: string, codepoints: string) => PdfEmojiImage | null | Promise<PdfEmojiImage | null>);

export const PDF_EMOJI = new InjectionToken<PdfEmojiSource>('ngpdf emoji');

/**
 * Draws emoji as inline images, 1 em square, for documents rendered with this environment injector
 * or one below it. ngpdf ships no emoji images and fetches nothing without this provider. Each
 * distinct emoji is loaded once per render, at most 500; one without an image is drawn as text.
 */
export function providePdfEmoji(source: PdfEmojiSource): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: PDF_EMOJI, useValue: source }]);
}
