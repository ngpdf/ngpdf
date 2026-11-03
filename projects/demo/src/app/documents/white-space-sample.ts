import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

/**
 * Text with line breaks and tabs from data, under each `white-space` value: an address in
 * `pre-line`, a note in `pre-wrap`, a tab-aligned listing in `pre`, and a reference in `nowrap`.
 */
@Component({
  selector: 'app-white-space-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="White space sample" author="ngpdf demo" language="en">
      <pdf-page size="A5" style="padding: 36; font-size: 10">
        <pdf-text style="font-size: 18; font-weight: bold; margin-bottom: 12">White space</pdf-text>
        <pdf-text style="font-weight: bold">pre-line</pdf-text>
        <pdf-text style="white-space: pre-line; margin-bottom: 10">{{ address }}</pdf-text>
        <pdf-text style="font-weight: bold">pre-wrap</pdf-text>
        <pdf-text style="white-space: pre-wrap; width: 200; margin-bottom: 10">{{ note }}</pdf-text>
        <pdf-text style="font-weight: bold">pre</pdf-text>
        <pdf-text style="white-space: pre; font-family: Courier; margin-bottom: 10">{{
          listing
        }}</pdf-text>
        <pdf-text style="font-weight: bold">nowrap span</pdf-text>
        <pdf-text style="width: 160"
          >Quote the reference
          <pdf-span style="white-space: nowrap; font-weight: bold">{{ reference }}</pdf-span> when
          you call.</pdf-text
        >
      </pdf-page>
    </pdf-document>
  `,
})
export class WhiteSpaceSample {
  readonly address = 'Marta Quintela\nRua das Acácias, 42\n  Apt. 3B\nLagoa Serena, 01234-000';
  readonly note = 'Delivery window:  9:00 to 12:00.\nLeave the parcel with the porter.';
  readonly listing = 'Item\tQty\tPrice\nPaper\t2\t4.50\nInk\t10\t32.00';
  readonly reference = 'REF 2026 0417 B';
}
