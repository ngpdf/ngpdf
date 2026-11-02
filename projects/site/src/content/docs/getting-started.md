---
title: Getting started
description: Install @ngpdf/core, write a PDF document as an Angular component and download it or get a Blob from the browser with PdfRenderer.
section: Guide
order: 1
---

ngpdf renders Angular components to PDF, in the browser or in Node. A document is a normal standalone component whose template uses the `pdf-*` elements. ngpdf lays it out with flexbox, breaks it into pages and writes a PDF with selectable text.

## Install

```sh
npm install @ngpdf/core
```

Requirements:

- `@angular/core` 22 or newer (the peer dependency is `^22.0.0`).
- Zoneless or zone.js. ngpdf works with both.
- A browser, or Node for `renderToBuffer` from `@ngpdf/core/server`. Rendering uses `Blob` and WebAssembly. See [Server rendering](/docs/server-rendering).

The package adds at most 15 KB gzipped to your initial bundle. The layout and PDF engine is a separate chunk that loads on the first render. See [How it works](/docs/how-it-works).

## Write a document component

Import `PDF_ELEMENTS` and use the elements in the template. Data comes in through inputs, as in any component.

```ts
import { CurrencyPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';

export interface InvoiceLine {
  readonly id: number;
  readonly description: string;
  readonly amount: number;
}

@Component({
  selector: 'app-invoice-document',
  imports: [PDF_ELEMENTS, CurrencyPipe],
  template: `
    <pdf-document title="Invoice" author="Acme Tools">
      <pdf-page size="A4" style="padding: 48; font-size: 11">
        <pdf-text style="font-size: 20; font-weight: bold; margin-bottom: 16">
          Invoice for {{ customer() }}
        </pdf-text>
        @for (line of lines(); track line.id) {
          <pdf-view style="flex-direction: row; justify-content: space-between; padding: 4 0">
            <pdf-text>{{ line.description }}</pdf-text>
            <pdf-text>{{ line.amount | currency: 'USD' }}</pdf-text>
          </pdf-view>
        }
        <pdf-page-number />
      </pdf-page>
    </pdf-document>
  `,
})
export class InvoiceDocument {
  readonly customer = input.required<string>();
  readonly lines = input.required<InvoiceLine[]>();
}
```

A few things to know from the start:

- Lengths without a unit are points (1/72 inch). `padding: 48` is 48pt.
- The template must contain one `pdf-document` with at least one `pdf-page`.
- The component never appears on screen. ngpdf creates it, runs change detection once, reads the result and destroys it.

## Render it

Inject `PdfRenderer` and call `download` or `toBlob`.

```ts
import { Component, inject } from '@angular/core';
import { PdfRenderer } from '@ngpdf/core';
import { InvoiceDocument, type InvoiceLine } from './invoice-document';

@Component({
  selector: 'app-invoice-actions',
  template: `
    <button type="button" (click)="download()">Download PDF</button>
    <button type="button" (click)="preview()">Open in a new tab</button>
  `,
})
export class InvoiceActions {
  private readonly pdf = inject(PdfRenderer);

  private readonly lines: InvoiceLine[] = [
    { id: 1, description: 'Design review', amount: 450 },
    { id: 2, description: 'Two workshop days', amount: 1800 },
  ];

  protected async download(): Promise<void> {
    await this.pdf.download(InvoiceDocument, {
      inputs: { customer: 'Northwind Bakery', lines: this.lines },
      fileName: 'invoice.pdf',
    });
  }

  protected async preview(): Promise<void> {
    // Open the tab during the click, before any await, or a pop-up blocker may stop it.
    const tab = window.open('', '_blank');
    if (!tab) {
      // Blocked: save the file instead of rendering a preview nobody can see.
      await this.download();
      return;
    }
    try {
      const blob = await this.pdf.toBlob(InvoiceDocument, {
        inputs: { customer: 'Northwind Bakery', lines: this.lines },
      });
      const url = URL.createObjectURL(blob);
      tab.location.href = url;
      // The tab keeps using the URL while it is open; free the PDF once it closes.
      const watch = setInterval(() => {
        if (!tab.closed) return;
        URL.revokeObjectURL(url);
        clearInterval(watch);
      }, 2000);
    } catch (error) {
      tab.close();
      throw error;
    }
  }
}
```

- `toBlob(component, { inputs })` resolves to a `Blob` of type `application/pdf`. Upload it, preview it or save it yourself.
- `download(component, { inputs, fileName })` renders and saves the file through a temporary `<a download>` link.

`inputs` maps input names to values and is passed to `ComponentRef.setInput`. It is typed as `Record<string, unknown>`, so TypeScript does not check the names or the values against your component. A required input that you leave out makes the render fail with Angular's error for a missing required input.

## Outside an injection context

`PdfRenderer` needs an injection context. When you have none, for example in a plain function or a callback that runs later, use `renderToBlob` and `downloadPdf` and pass an `EnvironmentInjector` yourself.

```ts
import { ApplicationRef, EnvironmentInjector } from '@angular/core';
import { downloadPdf, renderToBlob } from '@ngpdf/core';
import { InvoiceDocument, type InvoiceLine } from './invoice-document';

export function invoiceBlob(injector: EnvironmentInjector, lines: InvoiceLine[]): Promise<Blob> {
  return renderToBlob(InvoiceDocument, {
    injector,
    inputs: { customer: 'Northwind Bakery', lines },
  });
}

export async function saveInvoice(appRef: ApplicationRef, lines: InvoiceLine[]): Promise<void> {
  await downloadPdf(InvoiceDocument, {
    injector: appRef.injector,
    inputs: { customer: 'Northwind Bakery', lines },
    fileName: 'invoice.pdf',
  });
}
```

`bootstrapApplication` resolves to the `ApplicationRef`, whose `injector` is an `EnvironmentInjector`. Inside a service you can also keep `inject(EnvironmentInjector)` in a field and use it later. The document component resolves its services from that injector. See [Rendering API](/docs/rendering-api) for the full signatures.

## Next steps

- [Documents and pages](/docs/documents-and-pages): metadata, page sizes and orientation.
- [Layout and styling](/docs/layout-and-styling): flexbox, units, colors and borders.
- [Tables](/docs/tables) and [Pagination](/docs/pagination): long lists across pages.
- [Elements](/docs/elements): every input of every element.
