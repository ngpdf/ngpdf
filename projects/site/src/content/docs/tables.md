---
title: Tables
description: Build tables with pdf-table, pdf-row and pdf-cell, size columns in points, fr or percent, merge cells with span and repeat header rows on each page.
section: Guide
order: 5
---

A table is a `pdf-table` with `pdf-row` children, each holding `pdf-cell`s. Columns are declared once, on the table, and every cell takes its width from its column.

```ts
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { PDF_ELEMENTS, type TableColumn } from '@ngpdf/core';

export interface Expense {
  readonly id: number;
  readonly date: Date;
  readonly category: string;
  readonly description: string;
  readonly amount: number;
}

@Component({
  selector: 'app-expenses-document',
  imports: [PDF_ELEMENTS, DatePipe, DecimalPipe],
  template: `
    <pdf-document title="Expense report">
      <pdf-page style="padding: 36; font-size: 9">
        <pdf-table [columns]="columns" style="border-bottom: 1 solid #999999">
          <pdf-row header style="background-color: #263238; color: #ffffff; font-weight: bold">
            <pdf-cell style="padding: 5 4"><pdf-text>Date</pdf-text></pdf-cell>
            <pdf-cell style="padding: 5 4"><pdf-text>Category</pdf-text></pdf-cell>
            <pdf-cell style="padding: 5 4"><pdf-text>Description</pdf-text></pdf-cell>
            <pdf-cell style="padding: 5 4; text-align: right"><pdf-text>Amount</pdf-text></pdf-cell>
          </pdf-row>
          @for (expense of expenses(); track expense.id) {
            <pdf-row [style.background-color]="$even ? '#ffffff' : '#f5f5f5'">
              <pdf-cell style="padding: 4"
                ><pdf-text>{{ expense.date | date: 'yyyy-MM-dd' }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding: 4"><pdf-text>{{ expense.category }}</pdf-text></pdf-cell>
              <pdf-cell style="padding: 4"><pdf-text>{{ expense.description }}</pdf-text></pdf-cell>
              <pdf-cell style="padding: 4; text-align: right"
                ><pdf-text>{{ expense.amount | number: '1.2-2' }}</pdf-text></pdf-cell
              >
            </pdf-row>
          }
          <pdf-row style="font-weight: bold; border-top: 1 solid #999999">
            <pdf-cell span="3" style="padding: 4"><pdf-text>Total</pdf-text></pdf-cell>
            <pdf-cell style="padding: 4; text-align: right"
              ><pdf-text>{{ total() | number: '1.2-2' }}</pdf-text></pdf-cell
            >
          </pdf-row>
        </pdf-table>
      </pdf-page>
    </pdf-document>
  `,
})
export class ExpensesDocument {
  readonly expenses = input.required<Expense[]>();
  readonly total = computed(() => this.expenses().reduce((sum, e) => sum + e.amount, 0));

  protected readonly columns: readonly TableColumn[] = [64, '1fr', '3fr', '15%'];
}
```

## Columns

`[columns]` is required. Each entry is one of:

| Entry | Meaning |
| --- | --- |
| `64` | a fixed width in points |
| `'15%'` | a percentage of the table's content width |
| `'1fr'` | a share of the width that is left |

Widths are resolved in this order:

1. Fixed columns take their width.
2. Percentage columns take their share of the table's content width (its width minus its own padding and borders).
3. What is left is split among the `fr` columns in proportion to their numbers.

If the fixed and percentage columns already take the whole width or more, the `fr` columns get 0. The table does not shrink columns to fit. Points are numbers, not strings. A negative amount, or a string that is not `Nfr` or `N%` (`'64'` included), throws `ngpdf: invalid column "<value>" on pdf-table`.

When you declare the columns in the class, type them as `readonly TableColumn[]` (or use `as const`) so the strings keep their `fr`/`%` literal types. Columns sized from their content (`auto`) are planned for v0.2.

## Cells and span

- A cell takes the width of its column by position: the first cell gets the first column, and so on.
- `span` merges columns: `span="3"` covers the next three columns. It is a number attribute, rounded down, and at least 1.
- A row may have fewer cells than columns; the rest of the row stays empty.
- A row whose cells, spans counted, need more columns than the table declares throws `ngpdf: pdf-row has more cells than pdf-table columns (5 > 4)`.

Cells stretch to the height of the tallest cell in the row, so their backgrounds and borders line up. A cell is a column flex container: use `justify-content: center` on it to center its content vertically.

## Padding and borders

Inside a table, rows keep the cells on their columns, so some styles are fixed:

- On a `pdf-row`: vertical padding, top and bottom borders and the background work. Horizontal padding, left and right borders, margins and `justify-content` are ignored, and `flex-direction` is always `row`. `gap` is set to 0.
- On a `pdf-cell`: margins, `min-width` and `max-width` are ignored. Padding, borders and backgrounds work.

ngpdf logs a dev-mode warning such as `ngpdf: ignored inside tables: pdf-row padding-left` when you set one of the ignored styles. Put horizontal padding on the cells, and draw vertical lines with `border-left` or `border-right` on cells.

## Zebra rows

Use the `$even` or `$odd` variable of `@for` with a style binding:

```html
@for (item of items(); track item.id) {
  <pdf-row [style.background-color]="$odd ? '#f2f2f2' : '#ffffff'">…</pdf-row>
}
```

## Header rows

Mark a row with `header` and it repeats at the top of every page the table runs onto. Several header rows are repeated together. Rows are never split across pages.

Current limits of header repetition:

- Headers taller than the page's content area are not repeated; their rows are laid out as ordinary rows.
- On a page whose first row fits only without the header, that row is placed without it, and the header is not repeated on that page.
- A table made only of header rows has nothing to repeat over, so its rows are ordinary rows.
- Header rows lose `break-before`.

See [Pagination](/docs/pagination) for how rows move between pages.

## Text in cells

Text styles set on a row or a cell, such as `font-weight` or `text-align`, are inherited by the text inside. Bare text in a cell, `<pdf-cell>{{ value }}</pdf-cell>`, is laid out as an anonymous `pdf-text` with the cell's text styles.

## pdf-row and pdf-cell outside a table

Outside a `pdf-table`, a `pdf-row` is a flex container with `flex-direction: row` and a `pdf-cell` is a plain container. Column widths and the table rules above apply only inside a table.
