<p align="center">
  <a href="https://ngpdf.dev"><img src="projects/site/brand/logo.svg" width="112" alt="ngpdf"></a>
</p>

# ngpdf

[![CI](https://github.com/ngpdf/ngpdf/actions/workflows/ci.yml/badge.svg)](https://github.com/ngpdf/ngpdf/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@ngpdf/core)](https://www.npmjs.com/package/@ngpdf/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/ngpdf/ngpdf/badge)](https://scorecard.dev/viewer/?uri=github.com/ngpdf/ngpdf)
<!-- prettier-ignore-start -->
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-4-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->
<!-- prettier-ignore-end -->

Write PDFs as Angular components, for Angular. A document is a normal component whose template
uses the `pdf-*` elements; ngpdf lays it out, breaks it into pages and writes the PDF in the
browser. The layout and PDF engine is loaded on the first render, so importing `@ngpdf/core` adds
at most 15 KB gzipped to your initial bundle.

**Docs, live demo and examples: [ngpdf.dev](https://ngpdf.dev)**

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
- Inside a `pdf-table`, horizontal padding, borders and margins on a row are ignored. Put
  horizontal padding on the `pdf-cell`s.
- A unit taller than a page (a row, or a `pdf-view` in a column) is clipped to its page.
- Children and images of a rounded view are clipped to its corners only with `overflow: hidden`.
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

## Demo

The demo app in [`projects/demo`](projects/demo) builds three documents from made-up data: a
capture report, a communicators list and a licences list. Run it with `npm start`.

## Releases

Each version is listed in [`projects/core/CHANGELOG.md`](projects/core/CHANGELOG.md) and on the
[releases page](https://github.com/ngpdf/ngpdf/releases), with its SBOM. Versions on npm are
published from GitHub Actions with [provenance](https://docs.npmjs.com/generating-provenance-statements),
which links each one to the commit and workflow that built it.

## Contributors ✨

Thanks go to these people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/GabeSilvaDev"><img src="https://avatars.githubusercontent.com/u/96894950?v=4?s=100" width="100px;" alt="Gabriel Silva"/><br /><sub><b>Gabriel Silva</b></sub></a><br /><a href="https://github.com/ngpdf/ngpdf/commits?author=GabeSilvaDev" title="Code">💻</a> <a href="https://github.com/ngpdf/ngpdf/commits?author=GabeSilvaDev" title="Documentation">📖</a> <a href="#design-GabeSilvaDev" title="Design">🎨</a> <a href="https://github.com/ngpdf/ngpdf/commits?author=GabeSilvaDev" title="Tests">⚠️</a> <a href="#infra-GabeSilvaDev" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#maintenance-GabeSilvaDev" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/arxigen"><img src="https://avatars.githubusercontent.com/u/341682957?v=4?s=100" width="100px;" alt="ARXIGEN"/><br /><sub><b>ARXIGEN</b></sub></a><br /><a href="https://github.com/ngpdf/ngpdf/commits?author=arxigen" title="Code">💻</a> <a href="https://github.com/ngpdf/ngpdf/commits?author=arxigen" title="Tests">⚠️</a> <a href="https://github.com/ngpdf/ngpdf/commits?author=arxigen" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://aaqibhafeezkhan.github.io/aaqibhafeezkhan.cv/"><img src="https://avatars.githubusercontent.com/u/292322256?v=4?s=100" width="100px;" alt="Aaqibhafeez Khan"/><br /><sub><b>Aaqibhafeez Khan</b></sub></a><br /><a href="https://github.com/ngpdf/ngpdf/commits?author=Aaqibhafeezkhan" title="Code">💻</a> <a href="https://github.com/ngpdf/ngpdf/commits?author=Aaqibhafeezkhan" title="Tests">⚠️</a> <a href="https://github.com/ngpdf/ngpdf/commits?author=Aaqibhafeezkhan" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/jay23606"><img src="https://avatars.githubusercontent.com/u/4602056?v=4?s=100" width="100px;" alt="Jay"/><br /><sub><b>Jay</b></sub></a><br /><a href="https://github.com/ngpdf/ngpdf/commits?author=jay23606" title="Code">💻</a> <a href="https://github.com/ngpdf/ngpdf/commits?author=jay23606" title="Tests">⚠️</a> <a href="https://github.com/ngpdf/ngpdf/commits?author=jay23606" title="Documentation">📖</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

Questions and ideas: [Discussions](https://github.com/ngpdf/ngpdf/discussions). Good first issues: [here](https://github.com/ngpdf/ngpdf/labels/good%20first%20issue).

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors)
specification. Contributions of any kind are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Security: see [SECURITY.md](SECURITY.md).
