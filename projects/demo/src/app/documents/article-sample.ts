import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

const SENTENCES = [
  'The survey team walked the northern ridge at first light and logged every marker it found.',
  'Most stones were where the old map put them, a few had sunk into the peat, and one was missing.',
  'Each reading went into the notebook twice, once in pencil and once in ink, as the rules required.',
  'By noon the wind had turned, so the second half of the route was done with the sun behind them.',
  'Back at the hut the numbers were checked against the previous year and the differences marked.',
];

/** Justified paragraphs long enough to break across pages, with orphans and widows kept. */
@Component({
  selector: 'app-article-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Article sample" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 11; line-height: 1.4">
        <pdf-text style="font-size: 18; font-weight: bold; margin-bottom: 12">
          Field notes
        </pdf-text>
        <pdf-text
          style="font-size: 8; letter-spacing: 0.5; text-transform: uppercase; color: #666666; margin-bottom: 10"
        >
          Northern ridge, spring survey
        </pdf-text>
        @for (paragraph of paragraphs; track $index; let i = $index) {
          @if (i === 3) {
            <pdf-text
              style="margin-bottom: 10; padding: 8; text-align: justify; background-color: #eef3fb; border-left: 3 solid #3366cc"
            >
              Note. {{ paragraph }}
            </pdf-text>
          } @else {
            <pdf-text style="margin-bottom: 10; text-align: justify">{{ paragraph }}</pdf-text>
          }
        }
        <pdf-text style="break-inside: avoid">
          This closing paragraph keeps its lines together with break-inside: avoid. {{ closing }}
        </pdf-text>
        <pdf-page-number format="Page {page} of {total}" style="font-size: 8" />
      </pdf-page>
    </pdf-document>
  `,
})
export class ArticleSample {
  readonly paragraphs = Array.from({ length: 7 }, (_, i) =>
    Array.from({ length: 4 + i }, (_, k) => SENTENCES[(i + k) % SENTENCES.length]).join(' '),
  );
  readonly closing = SENTENCES.join(' ');
}
