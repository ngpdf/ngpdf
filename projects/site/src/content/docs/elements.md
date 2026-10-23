---
title: Elements
description: Reference for the nine pdf-* elements of @ngpdf/core, with every input, its type, its default value and what it does in the rendered PDF.
section: Reference
order: 9
---

All nine elements are standalone components exported from `@ngpdf/core`. Import them all at once with `PDF_ELEMENTS`, or one by one by class name.

```ts
import { PDF_ELEMENTS } from '@ngpdf/core';

@Component({
  selector: 'app-report',
  imports: [PDF_ELEMENTS],
  template: `…`,
})
export class Report {}
```

| Selector | Class |
| --- | --- |
| `pdf-document` | `PdfDocument` |
| `pdf-page` | `PdfPage` |
| `pdf-view` | `PdfView` |
| `pdf-text` | `PdfText` |
| `pdf-image` | `PdfImage` |
| `pdf-table` | `PdfTable` |
| `pdf-row` | `PdfRow` |
| `pdf-cell` | `PdfCell` |
| `pdf-page-number` | `PdfPageNumber` |

Every element also takes a `style` attribute and `[style.*]` bindings. See [Style properties](/docs/style-properties).

## pdf-document

The root of a document. It holds `pdf-page` elements and the PDF's metadata.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `string` | `undefined` | The PDF's Title. Not written when unset. |
| `author` | `string` | `undefined` | The PDF's Author. |
| `subject` | `string` | `undefined` | The PDF's Subject. |
| `keywords` | `readonly string[]` | `undefined` | The PDF's Keywords, joined with `", "`. |
| `creationDate` | `Date` | `undefined` | The PDF's CreationDate. When unset, the time of the render is used. |

Only its `pdf-page` children are rendered. Its text styles are inherited by every page. See [Documents and pages](/docs/documents-and-pages).

## pdf-page

A page template. Its content continues on as many sheets as it needs, all of the same size.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `size` | `PageSize` | `'A4'` | `'A3'`, `'A4'`, `'A5'`, `'Letter'`, `'Legal'`, or `readonly [width, height]` in points. |
| `orientation` | `PageOrientation` | `'portrait'` | `'portrait'` or `'landscape'`. Landscape swaps width and height. |

`PageSize` and `PageOrientation` are exported types. Padding on the page is the margin of every sheet; background and border are drawn on every sheet. `width`, `height` and `margin` are ignored.

## pdf-view

A flex container, like a `div` with `display: flex; flex-direction: column`.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `breakBefore` | `boolean` | `false` | Starts a new sheet before this element. A boolean attribute: `<pdf-view breakBefore>` is `true`. |

In pagination, a column `pdf-view` with children is a wrapper whose children are units, and a row `pdf-view` is one unit. See [Pagination](/docs/pagination).

## pdf-text

A block of text. Its content is the text of all its child nodes.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `breakBefore` | `boolean` | `false` | Starts a new sheet before this element. A boolean attribute. |

It wraps at Unicode line-break opportunities and is never split across sheets. A nested `pdf-text` is flattened to its text. See [Text and fonts](/docs/text-and-fonts).

## pdf-image

A PNG or JPEG image.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string \| Blob \| ArrayBuffer` | required | A `data:` URL, a URL to fetch, a `Blob` or an `ArrayBuffer`. |

Sizing follows the aspect ratio unless you set both `width` and `height`; then `object-fit` (`contain` or `cover`) places the image. See [Images](/docs/images).

## pdf-table

A table with declared columns.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `columns` | `readonly TableColumn[]` | required | One entry per column: a number of points, `` `${number}fr` `` or `` `${number}%` ``. |

`TableColumn` is an exported type:

```ts
type TableColumn = number | `${number}fr` | `${number}%`;
```

Each row of the table is a pagination unit. See [Tables](/docs/tables).

## pdf-row

A table row. Its cells are laid out on the table's columns.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `header` | `boolean` | `false` | Repeats the row at the top of every sheet the table runs onto. A boolean attribute: `<pdf-row header>`. |

Inside a table, horizontal padding, left and right borders, margins and `justify-content` on a row are ignored. Outside a table, a `pdf-row` is a flex container whose default direction is `row`.

## pdf-cell

A table cell.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `span` | `number` | `1` | How many columns the cell covers. A number attribute (`span="2"` works), rounded down, at least 1. |

The cell's width comes from its columns. Margins, `min-width` and `max-width` on a cell inside a table are ignored.

## pdf-page-number

The sheet number, at the bottom of the content area of every sheet of its page.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `format` | `string` | `'{page} / {total}'` | `{page}` is replaced with the sheet number and `{total}` with the number of sheets in the document. |

It must be a direct child of `pdf-page`. It is right-aligned unless it or an ancestor sets `text-align`, and it reserves one line of height on every sheet. Content inside it is ignored. See [Pagination](/docs/pagination#page-numbers).
