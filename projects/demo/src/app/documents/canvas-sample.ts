import { Component } from '@angular/core';
import { PDF_ELEMENTS, type PdfCanvasPaint } from '@ngpdf/core';

interface Month {
  readonly label: string;
  readonly orders: number;
}

/** A bar chart and a signature line, both drawn with pdf-canvas. */
@Component({
  selector: 'app-canvas-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Canvas sample" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 10">
        <pdf-text style="font-size: 16; font-weight: bold; margin-bottom: 4"
          >Orders by month</pdf-text
        >
        <pdf-text style="color: #555; margin-bottom: 12">Made-up data for the ngpdf demo</pdf-text>

        <pdf-canvas
          [paint]="chart"
          style="height: 160; padding: 8; border: 1 solid #ccc; background-color: #fafafa"
        />
        <!-- Inset by the chart's padding and border, so each label sits under its bar. -->
        <pdf-view style="flex-direction: row; margin-top: 4; padding: 0 9">
          @for (month of months; track month.label) {
            <pdf-text style="flex: 1; text-align: center; color: #555">{{ month.label }}</pdf-text>
          }
        </pdf-view>

        <pdf-text style="margin-top: 48">Approved by</pdf-text>
        <pdf-canvas [paint]="signature" style="width: 200; height: 36" />
        <pdf-text style="color: #555">Field manager</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
export class CanvasSample {
  readonly months: readonly Month[] = [
    { label: 'Jan', orders: 42 },
    { label: 'Feb', orders: 58 },
    { label: 'Mar', orders: 35 },
    { label: 'Apr', orders: 71 },
    { label: 'May', orders: 64 },
    { label: 'Jun', orders: 88 },
  ];

  readonly chart: PdfCanvasPaint = (ctx, { width, height }) => {
    const max = Math.max(...this.months.map((month) => month.orders));
    const slot = width / this.months.length;
    // Grid lines at each quarter of the highest value.
    ctx.lineWidth(0.5).strokeColor('#dddddd').dash(2);
    for (let step = 1; step <= 4; step++) {
      const y = height - (height * step) / 4;
      ctx.moveTo(0, y).lineTo(width, y).stroke();
    }
    ctx.undash();
    this.months.forEach((month, index) => {
      const barHeight = (month.orders / max) * height;
      const x = index * slot + slot * 0.2;
      ctx.roundedRect(x, height - barHeight, slot * 0.6, barHeight, 2).fill('#dd0031');
    });
    ctx.lineWidth(1).strokeColor('#333333').moveTo(0, height).lineTo(width, height).stroke();
  };

  readonly signature: PdfCanvasPaint = (ctx, { width, height }) => {
    ctx
      .lineWidth(0.75)
      .moveTo(0, height - 1)
      .lineTo(width, height - 1)
      .stroke('#333333');
    // A small cross where the reader signs.
    ctx
      .lineWidth(1)
      .moveTo(2, height - 12)
      .lineTo(8, height - 6)
      .moveTo(8, height - 12);
    ctx.lineTo(2, height - 6).stroke('#999999');
  };
}
