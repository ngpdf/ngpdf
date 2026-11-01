import { InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';

/**
 * Cuts a word into the pieces it may break between, such as `['hy', 'phen', 'ation']`. The pieces
 * must join back to the word. `language` is the `language` of the `pdf-document`, if it has one.
 */
export type PdfHyphenate = (word: string, language: string | undefined) => readonly string[];

export const PDF_HYPHENATE = new InjectionToken<PdfHyphenate>('ngpdf hyphenation');

/**
 * Gives `hyphens: auto` text a hyphenation function, for documents rendered with this environment
 * injector or one below it. ngpdf ships no hyphenation patterns: the function usually wraps a
 * pattern library the app loads itself. It runs only for words that do not fit their line, once
 * per word and render.
 */
export function providePdfHyphenation(hyphenate: PdfHyphenate): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: PDF_HYPHENATE, useValue: hyphenate }]);
}
