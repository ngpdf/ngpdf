import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

/**
 * A footer that changes per sheet: "Continued on next page" under each sheet but the last, and
 * "End of report" under the last. The footer has a height, since its content varies.
 */
@Component({
  selector: 'app-per-sheet-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Content per sheet" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 10">
        <pdf-text style="font-size: 16; font-weight: bold; margin-bottom: 12">
          Trail maintenance log
        </pdf-text>

        <pdf-table [columns]="['1fr', '3fr', '1fr']">
          <pdf-row header style="font-weight: bold; border-bottom: 1 solid #ccc">
            <pdf-cell>Day</pdf-cell>
            <pdf-cell>Task</pdf-cell>
            <pdf-cell style="text-align: right">Hours</pdf-cell>
          </pdf-row>
          @for (entry of entries; track entry.day) {
            <pdf-row style="padding: 3 0">
              <pdf-cell>Day {{ entry.day }}</pdf-cell>
              <pdf-cell>{{ entry.task }}</pdf-cell>
              <pdf-cell style="text-align: right">{{ entry.hours }}</pdf-cell>
            </pdf-row>
          }
        </pdf-table>

        <pdf-view
          fixed="bottom"
          style="height: 20; margin-top: 8; padding-top: 4; border-top: 1 solid #999; flex-direction: row"
        >
          <ng-template pdfPerSheet let-sheet let-total="total">
            <pdf-text style="flex: 1; font-size: 8; color: #555">
              Sheet {{ sheet }} of {{ total }}
            </pdf-text>
            @if (sheet < total) {
              <pdf-text style="font-size: 8; font-style: italic">Continued on next page</pdf-text>
            } @else {
              <pdf-text style="font-size: 8; font-weight: bold">End of report</pdf-text>
            }
          </ng-template>
        </pdf-view>
      </pdf-page>
    </pdf-document>
  `,
})
export class PerSheetSample {
  readonly entries = Array.from({ length: 60 }, (_, i) => ({
    day: i + 1,
    task: ['Clear fallen branches', 'Repair a step', 'Paint trail markers', 'Drain a puddle'][
      i % 4
    ],
    hours: 1 + ((i * 7) % 5),
  }));
}
