---
title: Getting started
description: Install @ngpdf/core with ng add, write a PDF document as an Angular component and download it or get a Blob from the browser with PdfRenderer.
section: Guide
order: 1
---

ngpdf renders Angular components to PDF, in the browser. A document is a normal standalone component whose template uses the `pdf-*` elements. ngpdf lays it out with flexbox, breaks it into pages and writes a PDF with selectable text.

## Install

```sh
ng add @ngpdf/core
```

`ng add` installs the package with npm (or your package manager) and adds an example document to your application: `src/app/documents/example-document.ts`, a standalone component with a heading, a short table and a page number. It takes these options:

| Option | What it does |
| --- | --- |
| `--project <name>` | The application to add the example to. Without it, `ng add` uses the workspace's only project or the project of the folder you run it in, and otherwise asks. Without a terminal to ask in, it takes the only application, or stops and asks for `--project`. A library is refused. |
| `--path <folder>` | The folder for the example files, from the workspace root. The default is `src/app/documents` in the project. |
| `--demo-route` | Also adds `pdf-demo.ts`, a page with a Download PDF button that uses [`PdfDownload`](/docs/rendering-api#pdfdownload), and a lazy `pdf-demo` route in `app.routes.ts`. |

Then run `ng serve` and open `/pdf-demo` if you added the demo route.

- `ng add` never overwrites a file. If `example-document.ts` or `pdf-demo.ts` is already there, it is skipped, and the command says so.
- With `--demo-route`, if `example-document.ts` is already there, `ng add` adds no demo page and no route either, and says why: `pdf-demo.ts` imports `ExampleDocument`, which your file may not export.
- It does not change `main.ts` or your providers: ngpdf needs no setup, because `PdfRenderer` is provided in the root injector.
- If there is no `app.routes.ts`, or no `routes` array in it, `--demo-route` adds no route. It prints the route to add by hand instead.
- The package goes in `dependencies`, and nothing else is installed.

`ng build` then prints eight warnings like `Module 'unicode-trie' used by 'node_modules/linebreak/dist/module.mjs' is not ESM`. They name `unicode-trie` and `base64-js` (used by `linebreak` and `unicode-properties`), and `fast-deep-equal`, `dfa`, `clone`, `tiny-inflate` and `brotli/decompress.js` (used by `fontkit`). They come from `linebreak`, a dependency of ngpdf, and from `fontkit`, a dependency of pdfkit, and they ship only as CommonJS. They are in the PDF engine's lazy chunk, not in your initial bundle, and the build still succeeds. To silence the warnings, list them in the build options of your project in `angular.json`:

```json
"allowedCommonJsDependencies": [
  "base64-js",
  "brotli",
  "clone",
  "dfa",
  "fast-deep-equal",
  "tiny-inflate",
  "unicode-trie"
]
```

`ng add` leaves `angular.json` alone, so add this entry yourself if you want it.

To install the package without the example, use npm:

```sh
npm install @ngpdf/core
```

Requirements:

- `@angular/core` 22 or newer (the peer dependency is `^22.0.0`).
- Zoneless or zone.js. ngpdf works with both.
- A browser. Rendering uses `Blob`, `fetch` and WebAssembly. Server rendering is not supported in v0.1, so call ngpdf from browser code, such as a click handler.

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
