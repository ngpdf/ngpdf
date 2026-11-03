import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

/**
 * A ticket with dashed and dotted borders: a rounded dashed card, dotted fields to fill in, a
 * dashed cut line and a stub whose sides differ.
 */
@Component({
  selector: 'app-borders-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Borders sample" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 11">
        <pdf-text style="font-size: 18; font-weight: bold; margin-bottom: 12"
          >Spring fair ticket</pdf-text
        >

        <pdf-view
          style="padding: 14; border: 2 dashed #1565c0; border-radius: 10; margin-bottom: 18"
        >
          <pdf-text style="font-weight: bold; margin-bottom: 10">Admit one</pdf-text>
          <pdf-view style="flex-direction: row; margin-bottom: 10">
            <pdf-text style="width: 50">Name</pdf-text>
            <pdf-view style="flex: 1; border-bottom: 1 dotted #555" />
          </pdf-view>
          <pdf-view style="flex-direction: row">
            <pdf-text style="width: 50">Seat</pdf-text>
            <pdf-view style="flex: 1; border-bottom: 1 dotted #555" />
          </pdf-view>
        </pdf-view>

        <pdf-view style="border-top: 1 dashed #999; padding-top: 4; margin-bottom: 18">
          <pdf-text style="color: #999; font-size: 8; text-align: center">Cut here</pdf-text>
        </pdf-view>

        <pdf-view
          style="padding: 10; border: 2 solid #c62828; border-left: 3 dotted #c62828; border-radius: 8"
        >
          <pdf-text style="color: #c62828">Stub: keep this part. Made-up event, no entry.</pdf-text>
        </pdf-view>
      </pdf-page>
    </pdf-document>
  `,
})
export class BordersSample {}
