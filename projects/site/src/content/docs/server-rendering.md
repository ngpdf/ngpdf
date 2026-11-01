---
title: Server rendering
description: Render a document to PDF bytes in Node with renderToBuffer from @ngpdf/core/server - in a plain script or an Angular SSR route, with no DOM - and how images and fonts are fetched on the server.
section: Guide
order: 9
---

`renderToBuffer` from `@ngpdf/core/server` renders a document component to PDF bytes in Node. It needs no DOM, no jsdom and no Angular SSR app, and it runs the same layout engine as the browser, so the same document gives the same PDF.

```ts
import { renderToBuffer } from '@ngpdf/core/server';

const pdf: Uint8Array = await renderToBuffer(Invoice, {
  inputs: { invoice },
  providers: [providePdfFonts([...])], // optional
  fetchImage: (url) => ..., // optional, see "Images and fonts on the server"
});
```

`@ngpdf/core/server` is an entry point of its own, so a browser app that imports `@ngpdf/core` never bundles it.

## The function

```ts
function renderToBuffer<T>(component: Type<T>, options?: RenderToBufferOptions): Promise<Uint8Array>;

interface RenderToBufferOptions {
  readonly inputs?: Record<string, unknown>;
  readonly providers?: readonly (Provider | EnvironmentProviders)[];
  readonly injector?: EnvironmentInjector;
  readonly fetchImage?: (url: string) => Promise<Uint8Array>;
}
```

| Option | What it does |
| --- | --- |
| `inputs` | Values for the document component's inputs, by input name, as in `renderToBlob`. |
| `providers` | Providers for the document, such as `providePdfFonts([...])` or your own services. |
| `injector` | An injector the document resolves its services from, such as your SSR app's. `providers` are added on top of it. |
| `fetchImage` | Reads an absolute image or font URL. Without it, the server refuses them. |

- The result is a `Uint8Array`, which is what Node's `Buffer` extends. Pass it to `res.end(pdf)`, `fs.writeFile` or an email attachment as it is.
- Every call is isolated like `renderToBlob`: its own injector, tree and writer, and the document is destroyed when the render settles. Two renders at once share nothing.
- Without `injector`, the document gets an injector of its own with only `providers`, running zoneless. Services with `providedIn: 'root'` resolve in it, and are destroyed with it after the render.
- A failed render rejects with the same `ngpdf:` errors as in the browser.

## In a plain Node script

A document is an Angular component, so it has to be compiled. In a project built with the Angular CLI it already is. In a plain script, load `@angular/compiler` first so Angular compiles it when it is first used:

```js
// render-invoice.mjs
import '@angular/compiler';
import { Component } from '@angular/core';
import { PDF_ELEMENTS } from '@ngpdf/core';
import { renderToBuffer } from '@ngpdf/core/server';
import { writeFile } from 'node:fs/promises';

class Invoice {
  number = '';
}
Component({
  selector: 'app-invoice',
  imports: [PDF_ELEMENTS],
  inputs: ['number'],
  template: `
    <pdf-document title="Invoice">
      <pdf-page size="A4">
        <pdf-text style="font-size: 18; font-weight: bold">Invoice {{ number }}</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})(Invoice);

await writeFile('invoice.pdf', await renderToBuffer(Invoice, { inputs: { number: 'INV-0042' } }));
```

`npm install @ngpdf/core @angular/core @angular/compiler`, then `node render-invoice.mjs`. In TypeScript, write the component with its decorator and `input()` as usual.

## In an Angular SSR app

In an app with Angular SSR, a PDF is one more route of the Express server in `server.ts`:

```ts
import { providePdfFonts } from '@ngpdf/core';
import { renderToBuffer } from '@ngpdf/core/server';
import { readFile } from 'node:fs/promises';
import { Invoice } from './src/app/invoice'; // your document component

const notoSans = new Uint8Array(await readFile('fonts/NotoSans-Regular.ttf'));

app.get('/invoices/:id.pdf', async (req, res, next) => {
  try {
    const invoice = await invoices.find(req.params.id);
    const pdf = await renderToBuffer(Invoice, {
      inputs: { invoice },
      providers: [providePdfFonts([{ family: 'Noto Sans', src: notoSans }])],
    });
    res.type('application/pdf').end(pdf);
  } catch (error) {
    next(error);
  }
});
```

That route renders with an injector of its own. To have the document resolve your app's services, its `LOCALE_ID` and its `providePdfFonts`, pass an `EnvironmentInjector` of the app instead, for example from a service that runs during server rendering:

```ts
const pdf = await renderToBuffer(Invoice, { injector: inject(EnvironmentInjector) });
```

## Images and fonts on the server

A server that fetched any URL found in a document could be made to fetch internal addresses, such as a cloud metadata service or an admin port. Image URLs often come from user data, so this is a server-side request forgery (SSRF) risk. On the server, ngpdf therefore fetches nothing on its own:

- `data:` URLs, `Blob` and `ArrayBuffer` images, and font bytes (`ArrayBuffer`, `Uint8Array`, `Blob`) always work.
- An absolute URL, such as `https://…`, is read only through `fetchImage`. Without it, the render rejects with `ngpdf: remote image "<url>" refused on the server; pass fetchImage`.
- A relative URL, such as `/assets/logo.png`, has no page to resolve against. It rejects with `ngpdf: relative image URL "<url>" on the server`, with or without `fetchImage`.
- Font URLs in `providePdfFonts` follow the same rules through the same `fetchImage`, with `remote font` and `relative font URL` in the messages.
- `<url>` is shown without its query string and fragment, which often carry a token. `fetchImage` gets the whole URL.
- If `fetchImage` rejects, the render rejects with `ngpdf: could not load image "<url>": <reason>` (or `font`).

`fetchImage` is where you decide what the server may fetch: an allow-list of hosts, a timeout and a size limit. For example:

```ts
const ALLOWED_HOSTS = new Set(['cdn.example.com']);
const MAX_BYTES = 5 * 1024 * 1024;

async function fetchImage(url: string): Promise<Uint8Array> {
  const { protocol, hostname } = new URL(url);
  if (protocol !== 'https:' || !ALLOWED_HOSTS.has(hostname)) {
    throw new Error('not on the allow-list');
  }
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error('too large');
  return bytes;
}

const pdf = await renderToBuffer(Invoice, { inputs: { invoice }, fetchImage });
```

`redirect: 'error'` stops an allowed host from redirecting the request to an internal one. For files on disk, read them yourself and pass the bytes: `pdf-image` takes an `ArrayBuffer`, such as `new Uint8Array(await readFile(path)).buffer`.

## What needs a browser

`downloadPdf`, `PdfRenderer.download`, `PdfDownload`, `pdfResource` and `pdf-viewer` save a file or show a PDF in the page, so they need a browser. On the server (no global `document`, or Angular's server platform) they throw `ngpdf: <name> needs a browser; on the server, use renderToBuffer from @ngpdf/core/server` before rendering anything. `PdfDownload` throws only when clicked, which never happens on the server.

In an SSR app, a component that creates a `pdfResource` or shows a `pdf-viewer` would throw while the page renders on the server. Put it in a `@defer` block: the server renders the placeholder, and the browser loads the block.

`renderToBlob` and `PdfRenderer.toBlob` are not blocked on the server, but they read image and font URLs with `fetch`, as in a browser, without the policy above. On the server, use `renderToBuffer`.

## Limits

- Node versions: those Angular 22 supports (`^22.22.3`, `^24.15.0` or `>=26.0.0`). The check in CI runs Node 22 and 24.
- Nothing that needs a DOM: the APIs in "What needs a browser", and anything in your document that uses `DOCUMENT`, `window` or browser APIs. A document's injector without `injector` has a placeholder `DOCUMENT` with nothing in it.
- The engine uses pdfkit's Node build, which Node picks through pdfkit's package exports, with its own standard font metrics. Yoga's WebAssembly is compiled once per process.
