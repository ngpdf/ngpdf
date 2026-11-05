import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

/**
 * A two-column layout in a row pdf-view: a long article next to a short shaded sidebar. The row is
 * taller than a page, so it splits across sheets; the sidebar's background runs down each piece.
 */
@Component({
  selector: 'app-two-column-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Two-column sample" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 9; line-height: 1.35">
        <pdf-text style="font-size: 16; font-weight: bold; margin-bottom: 10">
          River survey, spring
        </pdf-text>
        <pdf-view
          style="flex-direction: row; column-gap: 14; border-top: 1 solid #444; border-bottom: 1 solid #444; padding-top: 8; padding-bottom: 8"
        >
          <pdf-view style="flex: 1">
            @for (paragraph of article; track $index) {
              <pdf-text style="margin-bottom: 6">{{ paragraph }}</pdf-text>
            }
          </pdf-view>
          <pdf-view
            style="width: 110; padding: 6; background-color: #eef3f8; border-left: 2 solid #4a78a8"
          >
            <pdf-text style="font-weight: bold; margin-bottom: 4">At a glance</pdf-text>
            @for (fact of facts; track $index) {
              <pdf-text style="margin-bottom: 3">{{ fact }}</pdf-text>
            }
          </pdf-view>
        </pdf-view>
        <pdf-text style="margin-top: 8">End of the survey notes.</pdf-text>
        <pdf-page-number format="Page {page} of {total}" style="font-size: 8; margin-top: 6" />
      </pdf-page>
    </pdf-document>
  `,
})
export class TwoColumnSample {
  readonly article = Array.from(
    { length: 22 },
    (_, i) =>
      `Section ${String(i + 1).padStart(2, '0')}. The team walked the bank from marker ` +
      `${String(i * 3 + 1)} to marker ${String(i * 3 + 4)}, noting the water level, the state of ` +
      `the reeds and any fallen trees. The current was ${i % 3 === 0 ? 'slow' : 'steady'} and ` +
      `the water ${i % 2 === 0 ? 'clear' : 'brown after the rain'}, with ${String(((i * 5) % 9) + 2)} ` +
      `birds counted on the far side.`,
  );
  readonly facts = [
    'Length walked: 6.6 km',
    'Markers: 1 to 67',
    'Days: 4',
    'Team: three people',
    'Next survey: autumn',
  ];
}
