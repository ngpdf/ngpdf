import {
  InjectionToken,
  inject,
  makeEnvironmentProviders,
  type EnvironmentProviders,
} from '@angular/core';

/** One face of a font family, for `font-family` in documents. */
export interface PdfFont {
  /** The name documents use in `font-family`, matched in any case. */
  readonly family: string;
  /** A URL (or data URL) of a TTF, OTF, WOFF or WOFF2 file, or its bytes. */
  readonly src: string | ArrayBuffer | Uint8Array | Blob;
  readonly weight?: 'normal' | 'bold';
  readonly style?: 'normal' | 'italic';
}

/** A face as the engine takes it: its bytes are read only if a document names its family. */
export interface PdfFontSource {
  readonly family: string;
  readonly weight?: 'normal' | 'bold';
  readonly style?: 'normal' | 'italic';
  readonly load: () => Promise<{ readonly label: string; readonly data: Uint8Array }>;
}

export type FontLoader = (
  src: PdfFont['src'],
) => Promise<{ readonly label: string; readonly data: Uint8Array }>;

/** Font loads by URL. */
export type FontCache = Map<string, ReturnType<FontLoader>>;

/** The fonts of one environment injector and its ancestors, with each URL fetched once. */
export class PdfFontSet {
  readonly #fonts: readonly PdfFont[];
  readonly #parent: PdfFontSet | null;
  readonly #fetched: FontCache = new Map();

  constructor(fonts: readonly PdfFont[], parent: PdfFontSet | null) {
    this.#fonts = fonts;
    this.#parent = parent;
  }

  /**
   * The faces in order, the ancestors' first. A failed fetch is forgotten, so it is retried.
   * `cache` replaces the injector's URL cache for this call: a server render passes its own, so it
   * never reuses bytes that another render's `fetchImage` read.
   */
  sources(loader: FontLoader, cache?: FontCache): PdfFontSource[] {
    const fetched = cache ?? this.#fetched;
    const own = this.#fonts.map((font) => ({
      family: font.family,
      ...(font.weight && { weight: font.weight }),
      ...(font.style && { style: font.style }),
      load: () => read(font.src, loader, fetched),
    }));
    return [...(this.#parent?.sources(loader, cache) ?? []), ...own];
  }
}

function read(src: PdfFont['src'], loader: FontLoader, fetched: FontCache): ReturnType<FontLoader> {
  if (typeof src !== 'string') return loader(src);
  let pending = fetched.get(src);
  if (!pending) {
    pending = loader(src);
    fetched.set(src, pending);
    pending.catch(() => fetched.delete(src));
  }
  return pending;
}

const PDF_FONT_LISTS = new InjectionToken<readonly (readonly PdfFont[])[]>('ngpdf font lists');

export const PDF_FONT_SET = new InjectionToken<PdfFontSet>('ngpdf font set');

/**
 * Makes fonts available to documents rendered with this environment injector or one below it,
 * such as a route's. A font is loaded on the first render whose document names its family; a URL
 * is fetched once.
 */
export function providePdfFonts(fonts: readonly PdfFont[]): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: PDF_FONT_LISTS, useValue: fonts, multi: true },
    {
      // Every call provides the same factory; the injector keeps one, which reads every list.
      provide: PDF_FONT_SET,
      useFactory: () =>
        new PdfFontSet(
          inject(PDF_FONT_LISTS, { self: true }).flat(),
          inject(PDF_FONT_SET, { skipSelf: true, optional: true }),
        ),
    },
  ]);
}
