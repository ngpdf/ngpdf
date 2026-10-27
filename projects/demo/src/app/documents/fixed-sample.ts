import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

/**
 * A fixed header with the sheet number and a fixed footer, drawn on every sheet while a table runs
 * over several.
 */
@Component({
  selector: 'app-fixed-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Fixed header and footer" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 10">
        <pdf-view
          fixed="top"
          style="flex-direction: row; padding-bottom: 6; margin-bottom: 12; border-bottom: 1 solid #999"
        >
          <pdf-text style="flex: 1; font-weight: bold">Stock count</pdf-text>
          <pdf-text style="color: #555; margin-right: 12">Warehouse 7</pdf-text>
          <pdf-page-number format="Sheet {page} of {total}" style="color: #555" />
        </pdf-view>

        <pdf-table [columns]="['3fr', '1fr']">
          <pdf-row header style="font-weight: bold; border-bottom: 1 solid #ccc">
            <pdf-cell>Item</pdf-cell>
            <pdf-cell style="text-align: right">Count</pdf-cell>
          </pdf-row>
          @for (item of items; track item.code) {
            <pdf-row style="padding: 3 0">
              <pdf-cell>{{ item.code }} {{ item.name }}</pdf-cell>
              <pdf-cell style="text-align: right">{{ item.count }}</pdf-cell>
            </pdf-row>
          }
        </pdf-table>

        <pdf-view fixed="bottom" style="margin-top: 8">
          <pdf-text style="font-size: 8; color: #777">Made-up data for the ngpdf demo</pdf-text>
        </pdf-view>
        <pdf-page-number format="{page}/{total}" style="font-size: 8" />
      </pdf-page>
    </pdf-document>
  `,
})
export class FixedSample {
  readonly items = Array.from({ length: 70 }, (_, i) => ({
    code: `SKU-${String(1000 + i)}`,
    name: ['Bolts', 'Washers', 'Hinges', 'Brackets', 'Screws'][i % 5],
    count: (i * 37) % 500,
  }));
}
