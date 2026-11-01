---
title: Elements
description: Reference for the twelve pdf-* elements of @ngpdf/core, with every input, its type, its default value and what it does in the rendered PDF.
section: Reference
order: 9
---

All twelve elements are standalone components exported from `@ngpdf/core`. Import them all at once with `PDF_ELEMENTS`, or one by one by class name.

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
| `pdf-span` | `PdfSpan` |
| `pdf-link` | `PdfLink` |
| `pdf-note` | `PdfNote` |
| `pdf-image` | `PdfImage` |
| `pdf-table` | `PdfTable` |
| `pdf-row` | `PdfRow` |
| `pdf-cell` | `PdfCell` |
| `pdf-page-number` | `PdfPageNumber` |

Every element also takes a `style` attribute and `[style.*]` bindings. See [Style properties](/docs/style-properties).

`pdf-view`, `pdf-text`, `pdf-image`, `pdf-table`, `pdf-row` and `pdf-cell` also take these two inputs:

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `anchor` | `string \| null \| undefined` | `undefined` | Names the element as a place that `<pdf-link href="#name">` jumps to. Trimmed; an empty name is ignored, and a name already used warns in development mode. |
| `bookmark` | `string \| null \| undefined` | `undefined` | Adds an entry with this title to the PDF's bookmarks, pointing at the element. Trimmed; an empty title adds no entry. |

See [Links to a place in the document](/docs/text-and-fonts#links-to-a-place-in-the-document) and [Bookmarks](/docs/documents-and-pages#bookmarks).

## pdf-document

The root of a document. It holds `pdf-page` elements and the PDF's metadata.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | `string` | `undefined` | The PDF's Title. Not written when unset. |
| `author` | `string` | `undefined` | The PDF's Author. |
| `subject` | `string` | `undefined` | The PDF's Subject. |
| `keywords` | `readonly string[]` | `undefined` | The PDF's Keywords, joined with `", "`. |
| `creationDate` | `Date` | `undefined` | The PDF's CreationDate. When unset, the time of the render is used. |
| `language` | `string` | `undefined` | Canonical BCP 47 language tag written as `/Lang`. Empty or invalid values are errors. |
| `creator` | `string` | `undefined` | Application attribution in `/Creator`; omitted when unset. |
| `producer` | `string` | `'ngpdf'` | The PDF producer recorded in the metadata. |
| `pageMode` | `PageMode` | `undefined` | Initial viewer mode: `UseNone`, `UseOutlines` (the bookmarks panel), `UseThumbs` or `FullScreen`. |
| `pageLayout` | `PageLayout` | `undefined` | Initial layout: `SinglePage`, `OneColumn`, `TwoColumnLeft`, `TwoColumnRight`, `TwoPageLeft` or `TwoPageRight`. |

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
| `breakBefore` | `boolean` | `false` | Starts a new sheet before this element, or before the table row or row `pdf-view` it is in (see [Pagination](/docs/pagination)). A boolean attribute: `<pdf-view breakBefore>` is `true`. |
| `breakAfter` | `boolean` | `false` | Starts a new sheet after this element, or after the table row or row `pdf-view` it is in. A boolean attribute. |
| `fixed` | `'top' \| 'bottom' \| undefined` | `undefined` | Takes the view out of the flow and draws it at the top or bottom of every sheet of its `pdf-page`. Only on a direct child of `pdf-page`. See [Fixed headers and footers](/docs/pagination#fixed-headers-and-footers). |

In pagination, a column `pdf-view` with children is a wrapper whose children are units, and a row `pdf-view` is one unit. See [Pagination](/docs/pagination).

## pdf-text

A block of text. Its content is the text of all its child nodes.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `breakBefore` | `boolean` | `false` | Starts a new sheet before this element, or before the table row or row `pdf-view` it is in (see [Pagination](/docs/pagination)). A boolean attribute. |
| `breakAfter` | `boolean` | `false` | Starts a new sheet after this element, or after the table row or row `pdf-view` it is in. A boolean attribute. |

It wraps at Unicode line-break opportunities, and a long text breaks between lines across sheets (see [Text across pages](/docs/pagination#text-across-pages)). Style part of its text with `pdf-span`. A nested `pdf-text` is drawn in the outer text's style, with a warning in development mode. See [Text and fonts](/docs/text-and-fonts).

## pdf-span

Part of a `pdf-text` drawn in its own text styles, such as one bold word in a sentence. It has no inputs.

```html
<pdf-text>Total due: <pdf-span style="font-weight: bold">{{ total() }}</pdf-span></pdf-text>
```

It holds text and other `pdf-span` elements, and must be inside a `pdf-text`: anywhere else the render fails with `ngpdf: pdf-span must be inside a pdf-text`. Only `color`, `font-family`, `font-size`, `font-weight`, `font-style`, `text-decoration`, `letter-spacing`, `text-transform` and `hyphens` apply to it. See [Styled runs](/docs/text-and-fonts#styled-runs-pdf-span).

## pdf-link

A link to a URL. Where a `pdf-view` can go it is a column `pdf-view` whose box is clickable; inside a `pdf-text` it is inline, like a `pdf-span`, and the text it covers is clickable.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `href` | `string \| null \| undefined` | required | An absolute `http:`, `https:` or `mailto:` URL, or `#name` to jump to the element with `anchor="name"`. Any other value, including a missing one or a name no element has, writes no link, with a warning in development mode. |

```html
<pdf-text>Pay at <pdf-link [href]="payUrl" style="color: #1a56db; text-decoration: underline">example.com/pay</pdf-link>.</pdf-text>
```

A link has no default color or underline. Inline, only the text styles of a `pdf-span` apply to it. A `pdf-link` inside another `pdf-link` fails the render with `ngpdf: pdf-link inside a pdf-link`. See [Links](/docs/text-and-fonts#links-pdf-link).

## pdf-note

A comment on the page, like a sticky note in a PDF viewer: the viewer shows an icon, and clicking it opens a popup with the note's text. Put it where a `pdf-view` can go. Its content is the note's text.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `author` | `string \| null \| undefined` | `undefined` | Shown as the note's title, usually the reviewer's name. Trimmed; an empty or missing author writes no title. |
| `icon` | `NoteIcon` | `'comment'` | The icon the viewer draws: `'comment'`, `'note'`, `'help'`, `'key'`, `'insert'`, `'paragraph'` or `'new-paragraph'`. Any other value fails the render with `ngpdf: unknown icon "<icon>" on pdf-note`. |
| `open` | `boolean` | `false` | Shows the popup when the file opens. A boolean attribute: `<pdf-note open>`. |

```html
<pdf-note author="Ana" icon="help">Is this total before or after tax?</pdf-note>
<pdf-text>Total: {{ total() }}</pdf-text>
```

A note takes no space in the layout. Its icon sits at the left edge of its parent's content box, at the top of the next element, or at the bottom of the element before it when it is the last child. With `position: absolute` and `top`, `right`, `bottom` or `left` it can go anywhere on its containing block, for example next to a paragraph's top right corner. The annotation is 20pt square, kept inside the sheet; viewers draw the icon at their own size.

The icon color is the note's own `color`, sticky-note yellow (`#ffd400`) by default; it does not inherit the text color around it. Only `color`, `position`, `top`, `right`, `bottom` and `left` apply to a note; other properties warn in development mode.

The text is plain: text nodes only, with whitespace collapsed as in a `pdf-text`. Any character works, including those the standard fonts can't draw, because the viewer shows it, not ngpdf. An element inside a note fails the render with `ngpdf: pdf-note takes text only`, and a note inside a `pdf-text` with `ngpdf: pdf-note inside a pdf-text`.

A note is never printed, as viewers expect from review comments, and it has no action. In pagination it goes on the sheet of the content after it, or of the content before it when it is the last child, so it never lands alone on a sheet. See [Notes](/docs/pagination#notes).

`NoteIcon` is an exported type.

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
| `columns` | `readonly TableColumn[]` | required | One entry per column: a number of points, `` `${number}fr` ``, `` `${number}%` `` or `'auto'`. See [Columns](/docs/tables#columns). |

`TableColumn` is an exported type:

```ts
type TableColumn = number | `${number}fr` | `${number}%` | 'auto';
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

The sheet number. As a direct child of `pdf-page`, it sits at the bottom of the content area of every sheet; anywhere else, it is laid out where it is and shows the number of the sheet it is drawn on.

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `format` | `string` | `'{page} / {total}'` | `{page}` is replaced with the sheet number and `{total}` with the number of sheets in the document. |

As a direct child of `pdf-page`, it is right-aligned unless it or an ancestor sets `text-align`, and it reserves one line of height on every sheet. Elsewhere, for example in a [fixed header](/docs/pagination#fixed-headers-and-footers), its box is measured with three-digit numbers and the text is aligned in it by `text-align`. Content inside it is ignored. See [Pagination](/docs/pagination#page-numbers).
