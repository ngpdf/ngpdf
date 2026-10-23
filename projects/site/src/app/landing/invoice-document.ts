import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

export interface InvoiceLine {
  readonly id: number;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

/** The document the home page's live demo renders. Made-up data, edited by the visitor. */
@Component({
  selector: 'site-invoice-document',
  imports: [PDF_ELEMENTS, CurrencyPipe, DatePipe],
  template: `
    <pdf-document [title]="'Invoice for ' + customer()" author="ngpdf live demo">
      <pdf-page size="A4" style="padding: 48; font-size: 10; color: #1f1d1a">
        <pdf-view style="flex-direction: row; justify-content: space-between; margin-bottom: 28">
          <pdf-view>
            <pdf-text style="font-size: 20; font-weight: bold" [style.color]="accent()">{{
              company()
            }}</pdf-text>
            <pdf-text style="color: #6b6660">123 Paper Street, Springfield</pdf-text>
          </pdf-view>
          <pdf-view style="align-items: flex-end">
            <pdf-text style="font-size: 20; font-weight: bold">INVOICE</pdf-text>
            <pdf-text style="color: #6b6660">No. 2026-0042</pdf-text>
            <pdf-text style="color: #6b6660">{{ issuedAt() | date: 'MMMM d, y' }}</pdf-text>
          </pdf-view>
        </pdf-view>

        <pdf-view
          style="padding: 12; margin-bottom: 20; border-radius: 4; background-color: #f6f3ee"
        >
          <pdf-text style="font-size: 8; color: #6b6660">BILL TO</pdf-text>
          <pdf-text style="font-size: 12; font-weight: bold">{{ customer() }}</pdf-text>
        </pdf-view>

        <pdf-table [columns]="[36, '1fr', 50, 80, 90]">
          <pdf-row
            header
            style="padding-top: 6; padding-bottom: 6; color: #ffffff; font-weight: bold"
            [style.background-color]="accent()"
          >
            <pdf-cell style="padding-left: 6"><pdf-text>#</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 6"><pdf-text>Description</pdf-text></pdf-cell>
            <pdf-cell style="padding-right: 6; text-align: right"
              ><pdf-text>Qty</pdf-text></pdf-cell
            >
            <pdf-cell style="padding-right: 6; text-align: right"
              ><pdf-text>Unit price</pdf-text></pdf-cell
            >
            <pdf-cell style="padding-right: 6; text-align: right"
              ><pdf-text>Amount</pdf-text></pdf-cell
            >
          </pdf-row>
          @for (line of lines(); track line.id) {
            <pdf-row
              style="padding-top: 5; padding-bottom: 5"
              [style.background-color]="$odd ? '#f6f3ee' : '#ffffff'"
            >
              <pdf-cell style="padding-left: 6"
                ><pdf-text>{{ line.id }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 6"
                ><pdf-text>{{ line.description }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-right: 6; text-align: right"
                ><pdf-text>{{ line.quantity }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-right: 6; text-align: right"
                ><pdf-text>{{ line.unitPrice | currency: 'USD' }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-right: 6; text-align: right"
                ><pdf-text>{{
                  line.quantity * line.unitPrice | currency: 'USD'
                }}</pdf-text></pdf-cell
              >
            </pdf-row>
          }
        </pdf-table>

        <pdf-view style="flex-direction: row; justify-content: flex-end; margin-top: 14">
          <pdf-view style="width: 200; padding-top: 8; border-top: 1 solid #1f1d1a">
            <pdf-view style="flex-direction: row; justify-content: space-between">
              <pdf-text style="font-weight: bold">Total</pdf-text>
              <pdf-text style="font-weight: bold">{{ total() | currency: 'USD' }}</pdf-text>
            </pdf-view>
          </pdf-view>
        </pdf-view>

        <pdf-page-number
          format="Page {page} of {total}"
          style="text-align: right; font-size: 8; color: #6b6660"
        />
      </pdf-page>
    </pdf-document>
  `,
})
export class InvoiceDocument {
  readonly company = input.required<string>();
  readonly customer = input.required<string>();
  readonly accent = input.required<string>();
  readonly lines = input.required<readonly InvoiceLine[]>();
  readonly issuedAt = input.required<Date>();

  protected readonly total = computed(() =>
    this.lines().reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
  );
}

const ITEMS = [
  'Annual report layout',
  'Brand guidelines review',
  'Quarterly statements, batch print',
  'Data table typesetting',
  'Accessibility audit',
  'Logo vector cleanup',
  'Cover page illustration',
  'Translation proofreading',
  'Print-ready export',
  'Support retainer',
] as const;

/** Deterministic made-up lines, so the same count always gives the same invoice. */
export function makeInvoiceLines(count: number): InvoiceLine[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    description: ITEMS[index % ITEMS.length] ?? 'Service',
    quantity: (index % 4) + 1,
    unitPrice: 40 + ((index * 37) % 260),
  }));
}
