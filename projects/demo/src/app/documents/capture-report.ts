import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

@Component({
  selector: 'app-capture-report',
  imports: [PDF_ELEMENTS, DatePipe],
  template: `
    <pdf-document [title]="title()" author="ngpdf demo" [creationDate]="capturedAt()">
      <pdf-page size="A4" orientation="landscape" style="padding: 36">
        <pdf-text style="font-size: 20; font-weight: bold">{{ title() }}</pdf-text>
        <pdf-text style="font-size: 10; color: #555555; margin-top: 4; margin-bottom: 14">
          {{ 'Gerado em ' + (capturedAt() | date: 'dd/MM/yyyy HH:mm') }}
        </pdf-text>
        <!--
          The image fills the rest of the page (there is no "fill remaining height"): A4 landscape
          is 595.28 high, minus 2 x 36 padding = 523.28; the title takes 20 x 1.2 = 24, the date
          line 10 x 1.2 = 12 plus margins 4 + 14 = 18, so 54 in all. 523.28 - 54 = 469.28,
          rounded down so the image never spills onto a second page.
        -->
        <pdf-image [src]="image()" style="width: 100%; height: 469; object-fit: contain" />
      </pdf-page>
    </pdf-document>
  `,
})
export class CaptureReport {
  readonly title = input.required<string>();
  readonly capturedAt = input.required<Date>();
  readonly image = input.required<Blob>();
}
