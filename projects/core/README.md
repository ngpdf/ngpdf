# @ngpdf/core

Write PDFs as Angular components, for Angular. A document is a normal component whose template
uses the `pdf-*` elements; ngpdf lays it out, breaks it into pages and writes the PDF in the
browser. The layout and PDF engine is loaded on the first render, so importing `@ngpdf/core` adds
at most 15 KB gzipped to your initial bundle.

<!-- The sections from "Install" to "v0.1 limits" are copied from the repository README;
     scripts/check-readme.mjs fails CI when they differ. Edit both. -->

## Install

```sh
npm install @ngpdf/core
```

It needs `@angular/core` 22 or newer, and works zoneless and with zone.js.

## Example: a communicators list

```ts
import { DatePipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { PDF_ELEMENTS, PdfRenderer } from '@ngpdf/core';

@Component({
  selector: 'app-communicators-list',
  imports: [PDF_ELEMENTS, DatePipe],
  template: `
    <pdf-document title="Lista de comunicadores">
      <pdf-page style="padding: 36; font-size: 9">
        <pdf-table [columns]="[30, '2fr', '3fr', '1fr', '1fr']">
          <pdf-row
            header
            style="padding-top: 5; padding-bottom: 5; background-color: #dd0031; color: #ffffff"
          >
            <pdf-cell style="padding-left: 4"><pdf-text>#</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 4"><pdf-text>Nome</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 4"><pdf-text>E-mail</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 4"><pdf-text>Telefone</pdf-text></pdf-cell>
            <pdf-cell style="padding-left: 4"><pdf-text>Cadastro</pdf-text></pdf-cell>
          </pdf-row>
          @for (item of items(); track item.id) {
            <pdf-row
              style="padding-top: 4; padding-bottom: 4"
              [style.background-color]="$odd ? '#f2f2f2' : '#ffffff'"
            >
              <pdf-cell style="padding-left: 4"
                ><pdf-text>{{ item.id }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4"
                ><pdf-text>{{ item.name }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4"
                ><pdf-text>{{ item.email }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4"
                ><pdf-text>{{ item.phone }}</pdf-text></pdf-cell
              >
              <pdf-cell style="padding-left: 4">
                <pdf-text>{{ item.registeredAt | date: 'dd/MM/yyyy' }}</pdf-text>
              </pdf-cell>
            </pdf-row>
          }
        </pdf-table>
        <pdf-page-number format="Página {page} de {total}" style="text-align: right" />
      </pdf-page>
    </pdf-document>
  `,
})
export class CommunicatorsList {
  readonly items = input.required<Communicator[]>();
}

// Anywhere with an injection context:
const pdf = inject(PdfRenderer);
await pdf.download(CommunicatorsList, { inputs: { items }, fileName: 'communicators.pdf' });
// or: const blob = await pdf.toBlob(CommunicatorsList, { inputs: { items } });
```

The header row repeats on every page, rows are never split, and the text stays selectable.

## v0.1 limits

- In the standard PDF fonts, WinAnsi only: a character outside it is drawn as `?`, with a warning
  in development mode. Register your own fonts with `providePdfFonts` for anything else.
- `pdf-page-number` always sits at the bottom of the content area.
- Inside a `pdf-table`, horizontal padding, borders and margins on a row are ignored. Put
  horizontal padding on the `pdf-cell`s.
- A unit taller than a page (a row, or a `pdf-view` in a column) is clipped to its page.
- `border-radius` together with borders draws square border lines.
- A bare number is in points, except in `line-height`, where it multiplies the font size as in
  CSS (`line-height: 1.4`). Write `line-height: 14pt` for points.
- Text sits at the top of its line box: extra `line-height` goes below the text, not half above
  and half below as in CSS.
- Bare text inside an element other than `pdf-text` (`<pdf-cell>{{ x }}</pdf-cell>`) is laid out
  as an anonymous `pdf-text` with its parent's text styles.
- Your own components inside a document are transparent, like `display: contents`: their
  `pdf-*` elements are laid out as if written in place, and styles on the component's host
  element are ignored with a warning. Style a `pdf-*` element inside it instead. The same goes
  for the document component you render: style its `pdf-document` or `pdf-page`, not its host.
- Colors are hex (3, 4, 6 or 8 digits), `rgb()`/`rgba()`, the CSS named colors and
  `transparent`. Other forms, such as `hsl()`, throw.
- `opacity` multiplies down the tree; a faded view's children are each faded, not composited as
  one group, so overlapping children show through each other.
- A table header row is not repeated on a page whose first row fits only without it.
- Images fetched from a URL have no size limit; a very large image is downloaded in full.

## More

- Documentation and live demo: [https://ngpdf.dev](https://ngpdf.dev)
- Source, issues and the demo app: [https://github.com/ngpdf/ngpdf](https://github.com/ngpdf/ngpdf)
- Contributing: [https://github.com/ngpdf/ngpdf/blob/main/CONTRIBUTING.md](https://github.com/ngpdf/ngpdf/blob/main/CONTRIBUTING.md)
- Security: [https://github.com/ngpdf/ngpdf/blob/main/SECURITY.md](https://github.com/ngpdf/ngpdf/blob/main/SECURITY.md)
- Roadmap: [https://github.com/ngpdf/ngpdf/blob/main/docs/roadmap-v0.2.md](https://github.com/ngpdf/ngpdf/blob/main/docs/roadmap-v0.2.md)

## License

MIT.
