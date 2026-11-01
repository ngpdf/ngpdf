import { Component, computed, input } from '@angular/core';
import { PDF_ELEMENTS, type PdfSecurity } from '@ngpdf/core';

/**
 * A payslip that asks for a password when opened and cannot be printed or copied from. The
 * password comes in through `inputs`, as one typed by the user would.
 */
@Component({
  selector: 'app-secure-sample',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Payslip" author="ngpdf demo" [security]="security()">
      <pdf-page size="A5" style="padding: 36; font-size: 11">
        <pdf-text style="font-size: 18; font-weight: bold; margin-bottom: 12">
          Payslip, October 2026
        </pdf-text>
        <pdf-text style="margin-bottom: 4">Employee: Rosa Example, #0042</pdf-text>
        <pdf-text style="margin-bottom: 4">Gross pay: € 3,150.00</pdf-text>
        <pdf-text>Net pay: € 2,480.75</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
export class SecureSample {
  readonly password = input.required<string>();

  protected readonly security = computed<PdfSecurity>(() => ({
    userPassword: this.password(),
    permissions: { printing: 'none', copying: false },
  }));
}
