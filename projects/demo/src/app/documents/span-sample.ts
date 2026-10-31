import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

/**
 * Styled runs inside one paragraph, each in a pdf-span, a note cut to two lines, and a rotated
 * stamp.
 */
@Component({
  selector: 'app-span-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Span sample" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 11">
        <pdf-text style="font-size: 18; font-weight: bold; margin-bottom: 12">
          Styled runs
        </pdf-text>
        <pdf-text style="margin-bottom: 8">
          Invoice <pdf-span style="font-weight: bold">#{{ invoice }}</pdf-span> totals
          <pdf-span style="font-size: 16; font-weight: bold">{{ total }}</pdf-span> and is
          <pdf-span style="color: #b00020; font-style: italic">{{ days }} days overdue</pdf-span>.
          Pay it at <pdf-span style="text-decoration: underline">example.com/pay</pdf-span>.
        </pdf-text>
        <pdf-text style="width: 160; margin-bottom: 8">
          A narrow box wraps
          <pdf-span style="font-weight: bold">across span boundaries and inside spans</pdf-span>
          as one paragraph.
        </pdf-text>
        <pdf-text style="width: 160; max-lines: 2; margin-bottom: 8">
          {{ note }} <pdf-span style="font-weight: bold">{{ signature }}</pdf-span>
        </pdf-text>
        <pdf-text>
          Ships to
          <pdf-span style="font-family: 'Noto Sans'">Łódź</pdf-span>
          from <pdf-span style="font-family: Courier">WAREHOUSE-7</pdf-span>.
        </pdf-text>
        <pdf-view
          style="align-self: flex-end; margin-top: 24; padding: 4 10; border: 2 solid #b00020; border-radius: 4; transform: rotate(-12deg)"
        >
          <pdf-text style="color: #b00020; font-size: 16; font-weight: bold; letter-spacing: 2">
            OVERDUE
          </pdf-text>
        </pdf-view>
      </pdf-page>
    </pdf-document>
  `,
})
export class SpanSample {
  readonly invoice = 1024;
  readonly total = '€ 1,280.00';
  readonly days = 12;
  readonly note =
    'Delivery window agreed by phone: weekdays after 2 pm, at the side gate, with a call ahead.';
  readonly signature = 'Signed by the warehouse team';
}
