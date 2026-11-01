import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

interface Line {
  readonly item: string;
  readonly amount: string;
}

const LINES: readonly Line[] = [
  { item: 'Field kits', amount: '1,240.00' },
  { item: 'Travel', amount: '860.50' },
  { item: 'Printing', amount: '312.00' },
];

const FILLER =
  'The figures below come from the spring invoices and were entered by hand, so each one was ' +
  'checked against the receipts before the review. ';

/**
 * A budget draft with review notes: one in the flow, one placed at a card's top right corner, and
 * one before a section that starts the second sheet, which goes there with it.
 */
@Component({
  selector: 'app-notes-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Notes sample" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 11; line-height: 1.4">
        <pdf-text style="font-size: 18; font-weight: bold; margin-bottom: 12"
          >Budget draft</pdf-text
        >
        <pdf-note author="Ana" icon="help" open>
          Check with Zoë: are these figures in € or in $? ✓ when confirmed.
        </pdf-note>
        <pdf-text style="margin-bottom: 12">{{ filler }}</pdf-text>
        <pdf-view
          style="position: relative; padding: 10; background-color: #f4f4f0; margin-bottom: 12"
        >
          <pdf-note author="Bruno" icon="key" style="position: absolute; top: 0; right: 0">
            Travel includes the second trip.
          </pdf-note>
          @for (line of lines; track line.item) {
            <pdf-view style="flex-direction: row; justify-content: space-between">
              <pdf-text>{{ line.item }}</pdf-text>
              <pdf-text>{{ line.amount }}</pdf-text>
            </pdf-view>
          }
        </pdf-view>
        <pdf-note author="Ana" icon="note">Move the plan to its own sheet?</pdf-note>
        <pdf-view breakBefore>
          <pdf-text style="font-size: 15; font-weight: bold; margin-bottom: 8">Next steps</pdf-text>
          <pdf-text>{{ filler }}</pdf-text>
        </pdf-view>
        <pdf-page-number format="Page {page} of {total}" style="font-size: 8" />
      </pdf-page>
    </pdf-document>
  `,
})
export class NotesSample {
  readonly lines = LINES;
  readonly filler = FILLER.repeat(2);
}
