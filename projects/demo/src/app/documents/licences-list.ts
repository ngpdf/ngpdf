import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';
import type { Licence } from '../data';

@Component({
  selector: 'app-licences-list',
  imports: [PDF_ELEMENTS, DatePipe, CurrencyPipe],
  template: `
    <pdf-document title="Licenças ativas" author="ngpdf demo">
      <pdf-page size="A4" orientation="landscape" style="padding: 36; font-size: 9">
        <pdf-text style="font-size: 16; font-weight: bold; margin-bottom: 10">
          Licenças ativas
        </pdf-text>
        <pdf-table [columns]="['auto', '2fr', '3fr', 70, 70, 80, 'auto']">
          <pdf-row
            header
            style="padding-top: 5; padding-bottom: 5; background-color: #dd0031; color: #ffffff; font-weight: bold"
          >
            <pdf-cell style="padding-left: 4; padding-right: 4"><pdf-text>#</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 4; padding-right: 4"
              ><pdf-text>Produto</pdf-text></pdf-cell
            >
            <pdf-cell style="padding-left: 4; padding-right: 4"
              ><pdf-text>Cliente</pdf-text></pdf-cell
            >
            <pdf-cell style="padding-left: 4; padding-right: 4"
              ><pdf-text>Início</pdf-text></pdf-cell
            >
            <pdf-cell style="padding-left: 4; padding-right: 4"><pdf-text>Fim</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 4; padding-right: 4"
              ><pdf-text>Nota fiscal</pdf-text></pdf-cell
            >
            <pdf-cell style="padding-left: 4; padding-right: 4; text-align: right"
              ><pdf-text>Valor</pdf-text></pdf-cell
            >
          </pdf-row>
          @for (item of items(); track item.id) {
            <pdf-row
              style="padding-top: 4; padding-bottom: 4"
              [style.background-color]="$odd ? '#f2f2f2' : '#ffffff'"
            >
              <pdf-cell style="padding-left: 4; padding-right: 4"
                ><pdf-text>{{ item.id }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4; padding-right: 4"
                ><pdf-text>{{ item.product }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4; padding-right: 4"
                ><pdf-text>{{ item.customer }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4; padding-right: 4"
                ><pdf-text>{{ item.startsAt | date: 'dd/MM/yyyy' }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4; padding-right: 4"
                ><pdf-text>{{ item.endsAt | date: 'dd/MM/yyyy' }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4; padding-right: 4"
                ><pdf-text>{{ item.invoice }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4; padding-right: 4; text-align: right"
                ><pdf-text>{{ item.amount | currency: 'BRL' }}</pdf-text></pdf-cell
              >
            </pdf-row>
          }
        </pdf-table>
        <pdf-page-number
          format="Página {page} de {total}"
          style="text-align: right; font-size: 8"
        />
      </pdf-page>
    </pdf-document>
  `,
})
export class LicencesList {
  readonly items = input.required<Licence[]>();
}
