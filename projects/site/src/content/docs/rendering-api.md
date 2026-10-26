---
title: Rendering API
description: Reference for PdfRenderer, renderToBlob and downloadPdf in @ngpdf/core - signatures, option types, render lifecycle, errors and dev-mode warnings.
section: Reference
order: 10
---

`@ngpdf/core` exports one service, three functions and a directive that render a document component to a PDF.

| Export | Needs an injection context | Returns |
| --- | --- | --- |
| `PdfRenderer.toBlob` | yes, to inject `PdfRenderer` | `Promise<Blob>` |
| `PdfRenderer.download` | yes, to inject `PdfRenderer` | `Promise<void>` |
| `renderToBlob` | no, you pass an injector | `Promise<Blob>` |
| `downloadPdf` | no, you pass an injector | `Promise<void>` |
| `pdfResource` | yes, or pass `injector` | `PdfResourceRef` |
| `PdfDownload` | no, it is a directive | - |

## PdfRenderer

```ts
class PdfRenderer {
  toBlob<T>(component: Type<T>, options?: RenderOptions): Promise<Blob>;
  download<T>(component: Type<T>, options: DownloadOptions): Promise<void>;
}
```

A service provided in root. It keeps no state; every call is a separate render. It renders with the root `EnvironmentInjector` as the parent injector.

```ts
private readonly pdf = inject(PdfRenderer);

const blob = await this.pdf.toBlob(InvoiceDocument, { inputs: { customer, lines } });
await this.pdf.download(InvoiceDocument, { inputs: { customer, lines }, fileName: 'invoice.pdf' });
```

## renderToBlob and downloadPdf

```ts
function renderToBlob<T>(component: Type<T>, options: RenderToBlobOptions): Promise<Blob>;
function downloadPdf<T>(component: Type<T>, options: DownloadPdfOptions): Promise<void>;
```

The same renders, for code without an injection context. The `injector` you pass is the parent of the render's injector, so the document resolves its services from it. `PdfRenderer` calls these two functions.

## pdfResource

```ts
function pdfResource<T>(component: Type<T>, options?: PdfResourceOptions): PdfResourceRef;

interface PdfResourceOptions {
  readonly inputs?: () => Record<string, unknown> | undefined;
  readonly debounce?: number;
  readonly injector?: Injector;
}

interface PdfResourceRef extends Resource<Blob | undefined> {
  readonly url: Signal<string | undefined>;
  reload(): boolean;
  destroy(): void;
}
```

A PDF that stays current with signals, built on Angular's `resource()`. It renders when it is created and again whenever a signal read in `inputs` changes. A render overtaken by a newer one is dropped.

```ts
protected readonly lines = signal<InvoiceLine[]>([]);
protected readonly pdf = pdfResource(InvoiceDocument, {
  inputs: () => ({ customer: this.customer(), lines: this.lines() }),
  debounce: 300,
});
```

```html
@if (pdf.url(); as url) {
  <a [href]="url" download="invoice.pdf">Download</a>
} @else if (pdf.isLoading()) {
  <p>Rendering…</p>
} @else if (pdf.error(); as error) {
  <p>{{ error.message }}</p>
}
```

- `value()` is the `Blob`, and `status()`, `isLoading()`, `error()` and `hasValue()` work as on any `Resource`. Like any `Resource`, `value()` throws in the `error` status; `url()` does not, so templates can read it directly.
- `url()` is an object URL for the current PDF. It is created the first time you read it, and revoked when a newer PDF replaces it or when the resource is destroyed. Do not revoke it yourself.
- `inputs` returning `undefined` holds off rendering, and the resource stays `idle`. Use it while the data is still loading.
- `debounce` is how many milliseconds to wait after the last change before rendering. A slider or a text field otherwise starts a render per keystroke, and only the last one is kept.
- `injector` is needed outside an injection context. The resource is destroyed with it, and the document resolves its services from its `EnvironmentInjector`.

## PdfDownload

```html
<button
  type="button"
  [pdfDownload]="InvoiceDocument"
  [pdfInputs]="{ customer: customer(), lines: lines() }"
  pdfFileName="invoice.pdf"
  (pdfError)="showError($event)"
>
  Download PDF
</button>
```

A directive for the most common case, a button that downloads a document. Import `PdfDownload` in the component that uses it.

| Input or output | Type | |
| --- | --- | --- |
| `pdfDownload` | `Type<unknown>` | Required. The document component. |
| `pdfInputs` | `Record<string, unknown>` | The document's inputs, as in `RenderOptions`. Read when the host is clicked. |
| `pdfFileName` | `string` | Required. The name the browser saves the file under. |
| `(pdfError)` | `unknown` | Emits the error when the render fails. The error also goes to the app's `ErrorHandler`. |

- A click starts `downloadPdf` with the nearest `EnvironmentInjector`: a route's, if the route has `providers`, or the root one. The document can inject route-scoped services.
- While the PDF renders, the host gets `aria-busy="true"` and `aria-disabled="true"`, and further clicks are ignored, with their default action (a form submit, a link) cancelled. The directive never sets `disabled`, which would drop keyboard focus and could undo the app's own `[disabled]`. Style the busy state with `[aria-busy='true']`.
- The render counts as a pending task, so `whenStable()` in a test waits for it.

## Option types

All four option types are exported as types.

```ts
interface RenderOptions {
  /** Values for the document component's inputs, by input name. */
  readonly inputs?: Record<string, unknown>;
}

interface DownloadOptions extends RenderOptions {
  readonly fileName: string;
}

interface RenderToBlobOptions extends RenderOptions {
  /** The injector the document component resolves its dependencies from. */
  readonly injector: EnvironmentInjector;
}

interface DownloadPdfOptions extends DownloadOptions {
  readonly injector: EnvironmentInjector;
}
```

- `inputs` keys are the component's input names (the alias, if an input has one). Each value is set with `ComponentRef.setInput`. The record is not type-checked against the component.
- `fileName` is the name the browser saves the file under.

## The Blob

`toBlob` and `renderToBlob` resolve to a `Blob` with type `application/pdf`. The PDF's streams are compressed. To show it, create an object URL with `URL.createObjectURL(blob)` and revoke it when you are done; to upload it, send the `Blob` as a request body or in a `FormData`.

## What a render does

1. Creates a child `EnvironmentInjector` of the parent injector, with ngpdf's renderer factory in it.
2. Creates the component in that injector, sets each entry of `inputs` and runs change detection once. If that throws, the component and injector are destroyed and the promise rejects with the error. When a constructor throws, the document's or a child's, Angular gives back no component to destroy: the injector is destroyed, which runs its own `DestroyRef` callbacks (`inject(EnvironmentInjector).get(DestroyRef)`) and the `ngOnDestroy` of services provided in it, but `inject(DestroyRef)` callbacks that components registered before the throw do not run.
3. Loads the engine chunk on the first render. The chunk is cached; if loading fails, for example offline, the next render tries again.
4. Resolves styles, loads the document's images, lays it out, breaks it into pages and writes the PDF.
5. Destroys the component and its injector in a `finally` block, whether the render succeeded or failed.

`download` and `downloadPdf` then:

1. create an object URL for the `Blob`;
2. append an `<a download="<fileName>">` to the document body, click it and remove it;
3. revoke the object URL on the next tick.

The anchor is removed and the URL revoked even if the click throws.

If the render fails, nothing is clicked and the promise rejects.

Renders are isolated. Each has its own component, injector, node tree and PDF writer, so you can start several at once.

## Errors

The returned promise rejects with an `Error`. Errors from ngpdf start with `ngpdf:`.

| Message | Cause |
| --- | --- |
| `ngpdf: no pdf-document in the rendered component` | The template has no `pdf-document`. |
| `ngpdf: pdf-document has no pdf-page` | The document has no `pdf-page` child. |
| `ngpdf: unknown page size "<size>" on pdf-page` | A size name that does not exist, or a pair that is not two positive numbers. |
| `ngpdf: invalid color "<value>" on <element>` | A color in a form ngpdf does not read. |
| `ngpdf: unknown unit in "<value>" on <element>` | A unit other than `pt`, `px`, `in`, `cm`, `mm` or `%`. |
| `ngpdf: invalid length "<value>" on <element>` | A length that does not start with a number. |
| `ngpdf: expected a length in "<value>" on <element>` | A percentage or `auto` where only a length is allowed. |
| `ngpdf: invalid value "<value>" for <property> on <element>` | A keyword or number that the property does not accept. |
| `ngpdf: expected 1 to 4 values in "<value>" on <element>` | `margin`, `padding`, `border-width` or `border-color` with too many values. |
| `ngpdf: too many values in "<value>" on <element>` | A `border` with more than three parts. |
| `ngpdf: expected 1 to 3 values in "<value>" on <element>`, `ngpdf: invalid flex-grow in …`, `ngpdf: invalid flex-shrink in …` | An invalid `flex` shorthand. |
| `ngpdf: invalid line-height "auto" on <element>` | `line-height: auto`. |
| `ngpdf: invalid column "<value>" on pdf-table` | A column that is not a non-negative number, `Nfr` or `N%`. |
| `ngpdf: pdf-row has more cells than pdf-table columns (<used> > <declared>)` | A row whose cells, spans counted, exceed the columns. |
| `ngpdf: could not load image "<source>": <reason>` | An image that failed to load or is not PNG or JPEG. |
| `ngpdf: fixed views leave no room for content on pdf-page` | The `fixed` views and the page number take the whole content area. |
| `ngpdf: pdf-span must be inside a pdf-text` | A `pdf-span` outside a `pdf-text`. |
| `ngpdf: expected an integer of at least 1 in "<value>" for orphans on <element>` | `orphans` or `widows` below 1, or not a whole number. |
| `ngpdf: nesting deeper than 64` | More than 64 nested elements. |
| `ngpdf: text longer than 1 MB` | One text longer than 1,048,576 characters. |
| `ngpdf: could not load font "<src>": <reason>` | A font from `providePdfFonts` could not be fetched or read. The URL is shown without its query string. |
| `ngpdf: invalid font "<src>"` | The bytes are not a TrueType, OpenType, WOFF or WOFF2 font. |

Errors from your own template, such as a missing required input or an exception in a binding, reject the render with Angular's own error.

## Warnings

Some problems still produce a PDF. ngpdf collects them during the render and prints each distinct one once with `console.warn` at the end, also when the render fails. They are printed only in development mode, when Angular's `ngDevMode` is on.

| Warning | Meaning |
| --- | --- |
| `ngpdf: characters outside WinAnsi replaced with "?": <characters>` | See [Text and fonts](/docs/text-and-fonts#characters-winansi). |
| `ngpdf: characters missing from every font in their font-family, drawn as an empty box: <characters>` | See [Text and fonts](/docs/text-and-fonts#the-family-list-and-fallback). |
| `ngpdf: font "<family>" has no <face> face; using its <face> face` | A registered family without the weight or style asked for. See [Custom fonts](/docs/text-and-fonts#custom-fonts). |
| `ngpdf: <element> is taller than a page and is cut at the bottom` | A unit is clipped. See [Pagination](/docs/pagination#units-taller-than-a-page). |
| `ngpdf: ignored inside tables: <list>` | Row or cell styles that tables do not use. See [Tables](/docs/tables#padding-and-borders). |
| `ngpdf: styles on <tag> are ignored; style a pdf-* element inside it` | Styles on a component host. See [Components in documents](/docs/components-in-documents#hosts-are-transparent). |
| `ngpdf: border style "<style>" is not supported; drawing solid` | `dashed`, `dotted` and other styles are drawn solid. |
| `ngpdf: pdf-page-number must be a direct child of pdf-page` | A nested page number, which is not drawn. |
| `ngpdf: a fixed pdf-view must be a direct child of pdf-page` | A nested `fixed` view, laid out in the flow instead. |
| `ngpdf: <property> has no effect on pdf-span` | A box property on a `pdf-span`. See [Styled runs](/docs/text-and-fonts#styled-runs-pdf-span). |
| `ngpdf: a pdf-text inside a pdf-text is drawn in the outer style; use pdf-span` | A nested `pdf-text`. |
| `ngpdf: table columns did not settle` | Nested tables whose widths did not converge; the last layout is used. |
