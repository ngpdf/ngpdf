import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

interface ReceiptLine {
  readonly id: number;
  readonly name: string;
  readonly quantity: number;
  readonly price: number;
}

/**
 * An 80 mm thermal printer receipt on a page with an auto height: the sheet is as tall as its
 * lines, with the thank-you footer and the page number right after them.
 */
@Component({
  selector: 'app-receipt-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Receipt sample" author="ngpdf demo" language="en">
      <pdf-page
        [size]="['80mm', 'auto']"
        style="padding: 12; font-size: 8; background-color: #fffdf6; border-width: 1; border-color: #ccc"
      >
        <pdf-text style="font-size: 12; font-weight: bold; text-align: center"
          >Corner Bakery</pdf-text
        >
        <pdf-text style="text-align: center; margin-bottom: 8"
          >Rua das Flores, 12 · Lagoa Serena</pdf-text
        >
        @for (line of lines; track line.id) {
          <pdf-view style="flex-direction: row; margin-bottom: 2">
            <pdf-text style="flex: 1">{{ line.quantity }} × {{ line.name }}</pdf-text>
            <pdf-text>{{ (line.quantity * line.price).toFixed(2) }}</pdf-text>
          </pdf-view>
        }
        <pdf-view
          style="flex-direction: row; margin-top: 6; padding-top: 4; border-top-width: 1; border-color: #000; font-weight: bold"
        >
          <pdf-text style="flex: 1">Total</pdf-text>
          <pdf-text>{{ total.toFixed(2) }}</pdf-text>
        </pdf-view>
        <pdf-view fixed="bottom" style="margin-top: 10">
          <pdf-text style="text-align: center">Thank you, come again</pdf-text>
        </pdf-view>
        <pdf-page-number
          format="Receipt {page} of {total}"
          style="text-align: center; font-size: 6"
        />
      </pdf-page>
    </pdf-document>
  `,
})
export class ReceiptSample {
  readonly lines: readonly ReceiptLine[] = [
    { id: 1, name: 'Sourdough loaf', quantity: 1, price: 12.5 },
    { id: 2, name: 'Cheese bread', quantity: 6, price: 1.75 },
    { id: 3, name: 'Carrot cake slice', quantity: 2, price: 6.2 },
    { id: 4, name: 'Espresso', quantity: 2, price: 4 },
  ];
  readonly total = this.lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
}
