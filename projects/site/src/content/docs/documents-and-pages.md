---
title: Documents and pages
description: Set PDF metadata on pdf-document, pick page sizes and orientation on pdf-page, add page padding and start new pages with breakBefore.
section: Guide
order: 2
---

Every document has one `pdf-document` at the top and one or more `pdf-page` elements inside it.

## The document

`pdf-document` carries the PDF's metadata. All its inputs are optional.

```ts
@Component({
  selector: 'app-meta-document',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document
      title="Quarterly summary"
      author="Finance team"
      subject="Q3 results"
      [keywords]="['finance', 'quarterly']"
      [creationDate]="generatedAt()"
    >
      <pdf-page style="padding: 20mm">
        <pdf-text>Hello, PDF.</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
export class MetaDocument {
  readonly generatedAt = input.required<Date>();
}
```

| Input | Type | Written to the PDF as |
| --- | --- | --- |
| `title` | `string` | Title |
| `author` | `string` | Author |
| `subject` | `string` | Subject |
| `keywords` | `readonly string[]` | Keywords, joined with `", "` |
| `creationDate` | `Date` | CreationDate. Defaults to the time of the render. |

An input you leave unset is not written. Pass a fixed `creationDate` when you need the same bytes for the same data, for example in snapshot tests: it is the only time source in a render.

Rules for the document:

- ngpdf renders the first `pdf-document` it finds in the component. It does not have to be the root of the template.
- Only `pdf-page` children of the document are rendered. Anything else directly inside `pdf-document` is ignored.
- A `pdf-document` without a `pdf-page` fails with `ngpdf: pdf-document has no pdf-page`. A component without a `pdf-document` fails with `ngpdf: no pdf-document in the rendered component`.
- Text styles on `pdf-document`, such as `font-size` or `color`, are inherited by every page. Box styles on it are not used.

## Page size and orientation

`size` takes a named size or a `[width, height]` pair in points. The default is `A4`.

| Size | Width × height (pt) |
| --- | --- |
| `A3` | 841.89 × 1190.55 |
| `A4` | 595.28 × 841.89 |
| `A5` | 419.53 × 595.28 |
| `Letter` | 612 × 792 |
| `Legal` | 612 × 1008 |

`orientation` is `portrait` (the default) or `landscape`. Landscape swaps width and height.

The size names are case-sensitive: `a4` does not type-check, and at run time an unknown name or a pair with a value that is not a positive number fails with `ngpdf: unknown page size "<size>" on pdf-page`.

For a custom size, use the exported `PageSize` type:

```ts
import { type PageSize } from '@ngpdf/core';

export class PagesDocument {
  // 80 mm wide, 200 mm long, in points
  readonly receipt: PageSize = [226.77, 566.93];
}
```

```html
<pdf-page [size]="receipt" style="padding: 10; font-size: 8">
  <pdf-text>Receipt</pdf-text>
</pdf-page>
```

To convert: 1in = 72pt, 1cm = 72/2.54pt (about 28.35pt), 1mm = 72/25.4pt (about 2.83pt).

## Page padding, background and border

Style the page with `style`, as any other element.

- `padding` is the page margin. Content is laid out inside it on every page. A percentage is of the page width, for all four sides.
- `background-color` fills every page the element produces.
- `border` is drawn at the edge of every page. Its width is added to the padding, so content stays inside it.
- `width`, `height` and `margin` on a `pdf-page` are ignored: the page size comes from `size` and `orientation`.
- Text styles on the page are inherited by its content, so `style="font-size: 9"` on the page sets the base size.

ngpdf has no "page margin" setting apart from `padding`. The default padding is 0, so text starts at the very edge of the paper unless you set it.

## Multiple pages

A `pdf-page` element is a page template, not a single sheet. When its content does not fit, ngpdf continues it on new sheets of the same size, with the same padding, background, border and page number. See [Pagination](/docs/pagination).

Each `pdf-page` element starts a new sheet. Use separate elements when parts of a document need a different size or orientation:

```html
<pdf-document title="Training handbook">
  <pdf-page size="A5" style="padding: 36; background-color: #fdf6e3">
    <pdf-text style="font-size: 28; text-align: center">Training handbook</pdf-text>
  </pdf-page>
  <pdf-page size="A4" orientation="landscape" style="padding: 36">
    <pdf-text>Schedule</pdf-text>
    <pdf-view breakBefore>
      <pdf-text>Appendix</pdf-text>
    </pdf-view>
  </pdf-page>
</pdf-document>
```

## Starting a new page with breakBefore

Inside a page, `breakBefore` on a `pdf-view` or `pdf-text` moves that element to the top of a new sheet:

```html
<pdf-view breakBefore>…</pdf-view>
<pdf-view [breakBefore]="!first">…</pdf-view>
```

It is a boolean attribute: the bare attribute means `true`. For any other element, such as a `pdf-table` or a `pdf-row`, use the style `break-before: page`. Inside a table row or a row `pdf-view`, the break moves that whole row to the new sheet. A break at the top of a sheet that is still empty does nothing, so it never produces a blank page.

## Vertical space on a page

A page is laid out with unbounded height and then cut into sheets. So `justify-content: center` on a page does not center content vertically on the sheet, and an element cannot take "the rest of the page" height. Give such an element a fixed height instead. Filling the remaining height is planned for v0.2.
