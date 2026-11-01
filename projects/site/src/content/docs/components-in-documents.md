---
title: Components in documents
description: Split a PDF document into your own Angular components and use pipes, signals, dependency injection and locales inside it, as in any template.
section: Guide
order: 8
---

A document is an Angular component, so you can split it into smaller components, and use pipes, signals and services in it.

## Your own components

```ts
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, Service, computed, inject, input } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

export interface OrderLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

@Service()
export class CompanyInfo {
  readonly name = 'Acme Tools';
  readonly address = '12 Example Street, Springfield';
}

@Component({
  selector: 'app-letterhead',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-view style="flex-direction: row; justify-content: space-between; margin-bottom: 16">
      <pdf-text style="font-size: 16; font-weight: bold">{{ company.name }}</pdf-text>
      <pdf-text style="color: #666666">{{ company.address }}</pdf-text>
    </pdf-view>
  `,
})
export class Letterhead {
  protected readonly company = inject(CompanyInfo);
}

@Component({
  selector: 'app-order-row',
  imports: [PDF_ELEMENTS, CurrencyPipe],
  template: `
    <pdf-row [style.background-color]="striped() ? '#f5f5f5' : null">
      <pdf-cell style="padding: 4"><pdf-text>{{ line().sku }}</pdf-text></pdf-cell>
      <pdf-cell style="padding: 4"><pdf-text>{{ line().name }}</pdf-text></pdf-cell>
      <pdf-cell style="padding: 4; text-align: right"
        ><pdf-text>{{ subtotal() | currency: 'EUR' }}</pdf-text></pdf-cell
      >
    </pdf-row>
  `,
})
export class OrderRow {
  readonly line = input.required<OrderLine>();
  readonly striped = input(false);

  protected readonly subtotal = computed(() => this.line().quantity * this.line().unitPrice);
}

@Component({
  selector: 'app-order-document',
  imports: [PDF_ELEMENTS, DatePipe, Letterhead, OrderRow],
  template: `
    <pdf-document title="Order confirmation">
      <pdf-page style="padding: 40; font-size: 10">
        <app-letterhead />
        <pdf-text style="margin-bottom: 8">Placed on {{ placedAt() | date: 'longDate' }}</pdf-text>
        <pdf-table [columns]="[80, '1fr', 90]">
          <pdf-row header style="font-weight: bold; border-bottom: 1 solid #333333">
            <pdf-cell style="padding: 4"><pdf-text>SKU</pdf-text></pdf-cell>
            <pdf-cell style="padding: 4"><pdf-text>Item</pdf-text></pdf-cell>
            <pdf-cell style="padding: 4; text-align: right"><pdf-text>Subtotal</pdf-text></pdf-cell>
          </pdf-row>
          @for (line of lines(); track line.sku) {
            <app-order-row [line]="line" [striped]="$odd" />
          }
        </pdf-table>
      </pdf-page>
    </pdf-document>
  `,
})
export class OrderDocument {
  readonly placedAt = input.required<Date>();
  readonly lines = input.required<OrderLine[]>();
}
```

## Hosts are transparent

The host element of your component (`<app-order-row>` above) is not part of the layout. ngpdf replaces it with its children, like CSS `display: contents`. So:

- A `pdf-row` from a row component sits directly in the table. Its cells follow the table's columns, and a `header` row from a component still repeats.
- A `pdf-page` can come from a component inside `pdf-document`.
- A long list inside a component paginates row by row, as if it were written in place.
- Hosts do not count towards the nesting limit of 64 elements.

Styles on a host are ignored, with a dev-mode warning:

`ngpdf: styles on <app-order-row> are ignored; style a pdf-* element inside it`

That covers `style` attributes, `[style.*]` bindings and host style bindings. Put the style on a `pdf-*` element inside the component instead. The same goes for the document component you render: style its `pdf-document` or `pdf-page`, not its host.

Any element that is not one of the eleven `pdf-*` elements is treated as a host. A plain HTML element such as `<div>` or `<span>` in a document template is dissolved the same way and draws nothing itself.

## Pipes, signals and control flow

Everything that produces a value in a template works: pipes (`date`, `currency`, `number` and your own), `input()`, `computed()`, `@if`, `@for` with its context variables, `@switch` and `@let`. Import pipes and child components in `imports`, as usual.

## Change detection runs once

ngpdf creates the document component, sets its inputs, runs change detection once and then reads the result. Later changes are not seen. So:

- Pass data that is already loaded. Fetch it first, then render. An `async` pipe, a `resource()` or a timer whose value arrives after that first pass leaves the document without it.
- Do not use `@defer`. Its content is not loaded in time.
- Event bindings and outputs do nothing; a PDF has no events.

## Dependency injection

The document component and its children resolve services from an injector that ngpdf creates for the render. Its parent is:

- the root `EnvironmentInjector` when you use `PdfRenderer` (it is provided in root);
- the `injector` you pass to `renderToBlob` or `downloadPdf`.

Services provided in root are available. Providers on the component that calls `PdfRenderer` are not, because that component is not a parent of the document. Providers in the document component's own `providers`, or in its children's, work as usual.

When a document needs other providers, create an environment injector and pass it to `renderToBlob`. For example, to format one document in another locale:

```ts
import { EnvironmentInjector, LOCALE_ID, createEnvironmentInjector } from '@angular/core';
import { renderToBlob } from '@ngpdf/core';

// Render with a different locale than the app's.
export function germanOrder(parent: EnvironmentInjector, lines: OrderLine[]): Promise<Blob> {
  const injector = createEnvironmentInjector([{ provide: LOCALE_ID, useValue: 'de-DE' }], parent);
  return renderToBlob(OrderDocument, {
    injector,
    inputs: { placedAt: new Date(), lines },
  }).finally(() => injector.destroy());
}
```

The locale's data must be registered with `registerLocaleData`, as for any Angular app.

## Lifecycle

Each render gets its own component instance, injector and node tree, so two renders started together share nothing. Constructors, `inject()` and lifecycle hooks run as usual. When the render finishes, succeeds or fails, ngpdf destroys the component and its injector, so `DestroyRef` callbacks and `ngOnDestroy` run.
