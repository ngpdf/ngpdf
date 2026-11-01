import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

/**
 * A table row taller than a page: its long notes cell splits across sheets under the repeated
 * header, next to a short status cell, with the cell borders lined up on every sheet.
 */
@Component({
  selector: 'app-split-row-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Split row sample" author="ngpdf demo">
      <pdf-page size="A5" style="padding: 36; font-size: 9">
        <pdf-text style="font-size: 16; font-weight: bold; margin-bottom: 10">
          Inspection log
        </pdf-text>
        <pdf-table [columns]="[60, '1fr', 90]" style="border: 1 solid #444">
          <pdf-row header style="font-weight: bold; background-color: #e8e8e8">
            <pdf-cell style="padding: 4; border: 0.5 solid #444">Unit</pdf-cell>
            <pdf-cell style="padding: 4; border: 0.5 solid #444">Notes</pdf-cell>
            <pdf-cell style="padding: 4; border: 0.5 solid #444">Status</pdf-cell>
          </pdf-row>
          @for (visit of visits; track visit.unit) {
            <pdf-row>
              <pdf-cell style="padding: 4; border: 0.5 solid #444">{{ visit.unit }}</pdf-cell>
              <pdf-cell style="padding: 4; border: 0.5 solid #444">
                @for (note of visit.notes; track $index) {
                  <pdf-text style="margin-bottom: 3">{{ note }}</pdf-text>
                }
              </pdf-cell>
              <pdf-cell style="padding: 4; border: 0.5 solid #444; background-color: #f4f8ff">
                {{ visit.status }}
              </pdf-cell>
            </pdf-row>
          }
        </pdf-table>
        <pdf-page-number format="Page {page} of {total}" style="font-size: 8; margin-top: 6" />
      </pdf-page>
    </pdf-document>
  `,
})
export class SplitRowSample {
  readonly visits = [
    { unit: 'Pump 1', notes: ['Seals checked, no leaks.'], status: 'OK' },
    {
      unit: 'Pump 2',
      notes: Array.from(
        { length: 48 },
        (_, i) =>
          `Note ${String(i + 1).padStart(2, '0')}: reading taken at gauge ${String((i % 6) + 1)}, ` +
          `pressure ${String(40 + ((i * 7) % 13))} psi, valve ${i % 2 === 0 ? 'open' : 'closed'}.`,
      ),
      status: 'Follow up next week',
    },
    { unit: 'Pump 3', notes: ['Filter replaced.', 'Logged by the night shift.'], status: 'OK' },
  ];
}
