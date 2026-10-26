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

/** A face with its bytes, as the engine takes it. */
export interface LoadedPdfFont {
  readonly family: string;
  readonly weight?: 'normal' | 'bold';
  readonly style?: 'normal' | 'italic';
  readonly data: Uint8Array;
  readonly src: string;
}

export type FontLoader = (
  src: PdfFont['src'],
) => Promise<{ readonly label: string; readonly data: Uint8Array }>;

/** The fonts of one environment injector and its ancestors, with each URL fetched once. */
export class PdfFontSet {
  readonly #fonts: readonly PdfFont[];
  readonly #parent: PdfFontSet | null;
  readonly #fetched = new Map<string, ReturnType<FontLoader>>();

  constructor(fonts: readonly PdfFont[], parent: PdfFontSet | null) {
    this.#fonts = fonts;
    this.#parent = parent;
  }

  /** The faces in order, the ancestors' first. A failed fetch is forgotten, so it is retried. */
  async load(loader: FontLoader): Promise<LoadedPdfFont[]> {
    const own = await Promise.all(
      this.#fonts.map(async (font) => {
        const { label, data } = await this.#read(font.src, loader);
        return {
          family: font.family,
          ...(font.weight && { weight: font.weight }),
          ...(font.style && { style: font.style }),
          data,
          src: label,
        };
      }),
    );
    return [...((await this.#parent?.load(loader)) ?? []), ...own];
  }

  #read(src: PdfFont['src'], loader: FontLoader): ReturnType<FontLoader> {
    if (typeof src !== 'string') return loader(src);
    let pending = this.#fetched.get(src);
    if (!pending) {
      pending = loader(src);
      this.#fetched.set(src, pending);
      pending.catch(() => this.#fetched.delete(src));
    }
    return pending;
  }
}

const PDF_FONT_LISTS = new InjectionToken<readonly (readonly PdfFont[])[]>('ngpdf font lists');

export const PDF_FONT_SET = new InjectionToken<PdfFontSet>('ngpdf font set');

/**
 * Makes fonts available to documents rendered with this environment injector or one below it,
 * such as a route's. Fonts are loaded on the first render that needs them; a URL is fetched once.
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
