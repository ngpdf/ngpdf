import { Component } from '@angular/core';
import { PDF_ELEMENTS, type PdfHyphenate } from '@ngpdf/core';

// A stand-in for a pattern library such as `hyphen`, which an app would load lazily: the words of
// this sample, cut into pieces. Any other word is left whole.
const PIECES = new Map<string, readonly string[]>([
  ['hyphenation', ['hy', 'phen', 'ation']],
  ['typesetters', ['type', 'set', 'ters']],
  ['comfortable', ['com', 'fort', 'able']],
  ['paragraphs', ['para', 'graphs']],
  ['justified', ['jus', 'ti', 'fied']],
  ['particularly', ['par', 'tic', 'u', 'lar', 'ly']],
  ['extraordinarily', ['ex', 'tra', 'or', 'di', 'nar', 'i', 'ly']],
  ['uncomfortable', ['un', 'com', 'fort', 'able']],
  ['between', ['be', 'tween']],
  ['narrow', ['nar', 'row']],
  ['columns', ['col', 'umns']],
  ['spacing', ['spac', 'ing']],
]);

/** The demo's hyphenation function, given to this document with `providePdfHyphenation`. */
export const demoHyphenate: PdfHyphenate = (word) => {
  const pieces = PIECES.get(word.toLowerCase());
  if (!pieces) return [word];
  // The pieces in the word's own case.
  let at = 0;
  return pieces.map((piece) => word.slice(at, (at += piece.length)));
};

/**
 * The same paragraph in three narrow columns: no hyphenation, soft hyphens only (`&shy;` in the
 * template) and `hyphens: auto` with the function above, justified, in Noto Sans, whose hyphen
 * is U+2010.
 */
@Component({
  selector: 'app-hyphens-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Hyphens sample" author="ngpdf demo" language="en">
      <pdf-page size="A5" style="padding: 36; font-size: 10">
        <pdf-text style="font-size: 18; font-weight: bold; margin-bottom: 12">Hyphenation</pdf-text>
        <pdf-view style="flex-direction: row; justify-content: space-between">
          <pdf-view style="width: 100; hyphens: none">
            <pdf-text style="font-weight: bold; margin-bottom: 4">none</pdf-text>
            <pdf-text>{{ paragraph }}</pdf-text>
          </pdf-view>
          <pdf-view style="width: 100">
            <pdf-text style="font-weight: bold; margin-bottom: 4">manual</pdf-text>
            <pdf-text>
              Hyphen&shy;ation helps type&shy;setters keep narrow col&shy;umns
              com&shy;fort&shy;able, par&shy;tic&shy;u&shy;lar&shy;ly when para&shy;graphs are
              jus&shy;ti&shy;fied and the spacing between words would be
              extra&shy;or&shy;di&shy;nar&shy;i&shy;ly un&shy;com&shy;fort&shy;able.
            </pdf-text>
          </pdf-view>
          <pdf-view style="width: 100; hyphens: auto; font-family: 'Noto Sans'">
            <pdf-text style="font-weight: bold; margin-bottom: 4">auto</pdf-text>
            <pdf-text style="text-align: justify">{{ paragraph }}</pdf-text>
          </pdf-view>
        </pdf-view>
      </pdf-page>
    </pdf-document>
  `,
})
export class HyphensSample {
  readonly paragraph =
    'Hyphenation helps typesetters keep narrow columns comfortable, particularly when paragraphs are justified and the spacing between words would be extraordinarily uncomfortable.';
}
