import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly sections: readonly string[];
}

const CHAPTERS: readonly Chapter[] = [
  { id: 'route', title: 'The route', sections: ['Northern ridge', 'Valley floor'] },
  { id: 'markers', title: 'Markers found', sections: ['Standing stones', 'Sunken stones'] },
  { id: 'next', title: 'Next season', sections: ['Equipment'] },
];

const FILLER =
  'The team logged each marker twice, once in pencil and once in ink, and checked the numbers ' +
  'against the previous year back at the hut. ';

/**
 * A table of contents whose entries jump to their chapters, with bookmarks nested as the chapters
 * and sections are, and links back to the contents.
 */
@Component({
  selector: 'app-contents-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Contents sample" author="ngpdf demo" pageMode="UseOutlines">
      <pdf-page size="A5" style="padding: 36; font-size: 11; line-height: 1.4">
        <pdf-text anchor="contents" style="font-size: 18; font-weight: bold; margin-bottom: 12">
          Survey report
        </pdf-text>
        <pdf-view style="margin-bottom: 16; padding: 10; background-color: #eef3fb">
          <pdf-text style="font-weight: bold; margin-bottom: 4">Contents</pdf-text>
          @for (chapter of chapters; track chapter.id; let n = $index) {
            <pdf-link [href]="'#' + chapter.id">
              <pdf-text style="color: #1a56db">{{ n + 1 }}. {{ chapter.title }}</pdf-text>
            </pdf-link>
          }
        </pdf-view>
        @for (chapter of chapters; track chapter.id; let n = $index) {
          <pdf-view
            [anchor]="chapter.id"
            [bookmark]="n + 1 + '. ' + chapter.title"
            [breakBefore]="n > 0"
          >
            <pdf-text style="font-size: 15; font-weight: bold; margin-bottom: 8">
              {{ n + 1 }}. {{ chapter.title }}
            </pdf-text>
            @for (section of chapter.sections; track section) {
              <pdf-text [bookmark]="section" style="font-weight: bold; margin-bottom: 4">
                {{ section }}
              </pdf-text>
              <pdf-text style="margin-bottom: 10">{{ filler }}</pdf-text>
            }
            <pdf-text>
              <pdf-link href="#contents" style="color: #1a56db; text-decoration: underline"
                >Back to the contents</pdf-link
              >
            </pdf-text>
          </pdf-view>
        }
        <pdf-page-number format="Page {page} of {total}" style="font-size: 8" />
      </pdf-page>
    </pdf-document>
  `,
})
export class ContentsSample {
  readonly chapters = CHAPTERS;
  readonly filler = FILLER.repeat(3);
}
