// The code the home page shows. Each snippet is valid against the current @ngpdf/core API.

export const HERO_TEMPLATE = `@Component({
  selector: 'app-invoice',
  imports: [PDF_ELEMENTS, CurrencyPipe],
  template: \`
    <pdf-document title="Invoice">
      <pdf-page size="A4" style="padding: 48">
        <pdf-text style="font-size: 20; font-weight: bold">
          {{ company() }}
        </pdf-text>
        <pdf-table [columns]="['1fr', 80]">
          <pdf-row header style="background-color: #c2410c; color: #fff">
            <pdf-cell><pdf-text>Item</pdf-text></pdf-cell>
            <pdf-cell><pdf-text>Amount</pdf-text></pdf-cell>
          </pdf-row>
          @for (line of lines(); track line.id) {
            <pdf-row>
              <pdf-cell><pdf-text>{{ line.name }}</pdf-text></pdf-cell>
              <pdf-cell><pdf-text>{{ line.amount | currency }}</pdf-text></pdf-cell>
            </pdf-row>
          }
        </pdf-table>
        <pdf-page-number format="Page {page} of {total}" />
      </pdf-page>
    </pdf-document>
  \`,
})
export class Invoice {
  readonly company = input.required<string>();
  readonly lines = input.required<Line[]>();
}`;

export const RENDER_SNIPPET = `const pdf = inject(PdfRenderer);

// Save it...
await pdf.download(Invoice, {
  inputs: { company: 'Northwind', lines },
  fileName: 'invoice.pdf',
});

// ...or keep the Blob to upload, preview or attach.
const blob = await pdf.toBlob(Invoice, { inputs: { company: 'Northwind', lines } });`;
