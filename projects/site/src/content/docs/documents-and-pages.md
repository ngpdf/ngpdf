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
      language="en-US"
      creator="Quarterly Report App"
      pageMode="UseThumbs"
      pageLayout="TwoColumnLeft"
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
| `language` | `string` | Canonical BCP 47 tag in `/Lang`; empty or invalid tags are errors. |
| `creator` | `string` | Application attribution in `/Creator`; omitted when unset. |
| `producer` | `string` | `/Producer`; defaults to `ngpdf` instead of PDFKit. |
| `pageMode` | `PageMode` | Initial viewer mode: `UseNone`, `UseOutlines` (the bookmarks panel), `UseThumbs` or `FullScreen`. |
| `pageLayout` | `PageLayout` | Initial layout: `SinglePage`, `OneColumn`, `TwoColumnLeft`, `TwoColumnRight`, `TwoPageLeft` or `TwoPageRight`. |
| `security` | `PdfSecurity` | Encryption and permissions. See [Passwords and permissions](#passwords-and-permissions). |
| `debug` | `boolean` | Not metadata: draws layout outlines on every page. Off by default. See [Debugging layouts](/docs/layout-and-styling#debugging-layouts). |

Unset metadata inputs are omitted, except `producer`, which defaults to `ngpdf`, and `creationDate`, which defaults to the time of the render. To record the version too, bind `[producer]="'ngpdf ' + version"` with `version = VERSION.full` (see [VERSION](/docs/rendering-api#version)). Pass a fixed `creationDate` when you need the same bytes for the same data, for example in snapshot tests: it is the only time source in a render.

Rules for the document:

- ngpdf renders the first `pdf-document` it finds in the component. It does not have to be the root of the template.
- Only `pdf-page` children of the document are rendered. Anything else directly inside `pdf-document` is ignored.
- A `pdf-document` without a `pdf-page` fails with `ngpdf: pdf-document has no pdf-page`. A component without a `pdf-document` fails with `ngpdf: no pdf-document in the rendered component`.
- Text styles on `pdf-document`, such as `font-size` or `color`, are inherited by every page. Box styles on it are not used.

## Bookmarks

A `bookmark` title on an element adds an entry to the PDF's bookmarks, the outline that PDF viewers show in a side panel. Clicking the entry jumps to the element.

```html
<pdf-document pageMode="UseOutlines">
  <pdf-page>
    <pdf-view bookmark="1. Summary">
      <pdf-text bookmark="1.1 Totals">…</pdf-text>
    </pdf-view>
    <pdf-table bookmark="2. Line items" [columns]="['1fr', 80]">…</pdf-table>
  </pdf-page>
</pdf-document>
```

- `pdf-view`, `pdf-text`, `pdf-image`, `pdf-table`, `pdf-row` and `pdf-cell` take `bookmark`. It needs no `anchor`.
- Entries keep the order of the template. A bookmarked element inside another bookmarked element becomes its child entry, so the levels follow the nesting. Entries open expanded.
- An entry jumps where a link to the element's `anchor` would: the top left of its first piece, at the reader's zoom.
- Titles are trimmed, and an empty title adds no entry. Without any entry, the PDF has no outline.
- Viewers open the bookmarks panel only when the document asks for it with `pageMode="UseOutlines"`.

## Passwords and permissions

`security` encrypts the file and sets what a PDF viewer lets the reader do with it.

```ts
import { Component, computed, input } from '@angular/core';
import { PDF_ELEMENTS, type PdfSecurity } from '@ngpdf/core';

@Component({
  selector: 'app-payslip',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document title="Payslip" [security]="security()">
      <pdf-page style="padding: 20mm">
        <pdf-text>Net pay: € 2,480.75</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
export class Payslip {
  // Typed by the user, or sent by the server for this user.
  readonly password = input.required<string>();

  protected readonly security = computed<PdfSecurity>(() => ({
    userPassword: this.password(),
    permissions: { printing: 'none', copying: false },
  }));
}
```

Pass the password at render time like any other input: `this.pdf.toBlob(Payslip, { inputs: { password } })`, with `pdf` the injected `PdfRenderer`.

| Field | Type | Meaning |
| --- | --- | --- |
| `userPassword` | `string` | Asked for when the file is opened. |
| `ownerPassword` | `string` | Lifts the permissions in viewers that ask for it. |
| `permissions.printing` | `'none' \| 'low' \| 'high'` | `'high'` by default; `'low'` allows a degraded print only. |
| `permissions.copying` | `boolean` | Copying text and images. |
| `permissions.modifying` | `boolean` | Changing the document. |
| `permissions.annotating` | `boolean` | Adding comments and annotations. |
| `permissions.fillingForms` | `boolean` | Filling form fields. |
| `permissions.contentAccessibility` | `boolean` | Extracting content for accessibility tools. |
| `permissions.documentAssembly` | `boolean` | Inserting, rotating or deleting pages. |

How it behaves:

- The file is encrypted with AES-256 (PDF 1.7, extension level 3) when `security` sets a password or turns a permission off. pdfkit does the encryption in JavaScript, so there is no extra dependency.
- Every permission is allowed by default. Turn one off with `false`, or printing with `'none'`. A document with only a `userPassword` behaves as an unprotected one once it is open.
- With a permission turned off and no `ownerPassword`, a random 32-byte owner password is used, so the permissions cannot be lifted by someone who knows only the user password.
- A `security` with no password and no permission turned off writes an unencrypted file. An empty string counts as no password: with no permission turned off it writes an unencrypted file, and with one turned off the file is still encrypted, with a random owner password unless `ownerPassword` is set.
- A password that is not a string, a permission value not in the table, or an unknown field fails with `ngpdf: invalid security <field>`, for example `ngpdf: invalid security permissions.printing`.
- A password longer than 127 bytes in UTF-8 fails too, whether it is that long as typed or after Unicode NFKC normalization (which can make it longer): AES-256 PDF passwords stop there, and a password cut short without a word would be a trap. A password with a character that SASLprep refuses, such as a tab or another control character, makes the render fail with `ngpdf: invalid security password` when the file is written. Error messages never contain the password.

### Limits

- **Permissions are a request to the viewer.** Most viewers honour them, but any tool can ignore them. They do not protect the content.
- **A password written in your app's code ships to every user's browser.** Only a password the user enters, or one your server sends for that user, keeps meaning anything.
- **The user password is real protection.** Without it the content cannot be decrypted.

## Page size and orientation

`size` takes a named size or a `[width, height]` pair in points. The default is `A4`.

Every named size is portrait. Sizes in millimetres are converted at 72 / 25.4 points per millimetre and rounded to 2 decimals; sizes in inches are 72 points per inch.

| Size | Paper | Width × height (pt) |
| --- | --- | --- |
| `A0` | 841 × 1189 mm | 2383.94 × 3370.39 |
| `A1` | 594 × 841 mm | 1683.78 × 2383.94 |
| `A2` | 420 × 594 mm | 1190.55 × 1683.78 |
| `A3` | 297 × 420 mm | 841.89 × 1190.55 |
| `A4` | 210 × 297 mm | 595.28 × 841.89 |
| `A5` | 148 × 210 mm | 419.53 × 595.28 |
| `A6` | 105 × 148 mm | 297.64 × 419.53 |
| `A7` | 74 × 105 mm | 209.76 × 297.64 |
| `A8` | 52 × 74 mm | 147.4 × 209.76 |
| `A9` | 37 × 52 mm | 104.88 × 147.4 |
| `A10` | 26 × 37 mm | 73.7 × 104.88 |
| `B0` | 1000 × 1414 mm | 2834.65 × 4008.19 |
| `B1` | 707 × 1000 mm | 2004.09 × 2834.65 |
| `B2` | 500 × 707 mm | 1417.32 × 2004.09 |
| `B3` | 353 × 500 mm | 1000.63 × 1417.32 |
| `B4` | 250 × 353 mm | 708.66 × 1000.63 |
| `B5` | 176 × 250 mm | 498.9 × 708.66 |
| `B6` | 125 × 176 mm | 354.33 × 498.9 |
| `B7` | 88 × 125 mm | 249.45 × 354.33 |
| `B8` | 62 × 88 mm | 175.75 × 249.45 |
| `B9` | 44 × 62 mm | 124.72 × 175.75 |
| `B10` | 31 × 44 mm | 87.87 × 124.72 |
| `C0` | 917 × 1297 mm | 2599.37 × 3676.54 |
| `C1` | 648 × 917 mm | 1836.85 × 2599.37 |
| `C2` | 458 × 648 mm | 1298.27 × 1836.85 |
| `C3` | 324 × 458 mm | 918.43 × 1298.27 |
| `C4` | 229 × 324 mm | 649.13 × 918.43 |
| `C5` | 162 × 229 mm | 459.21 × 649.13 |
| `C6` | 114 × 162 mm | 323.15 × 459.21 |
| `C7` | 81 × 114 mm | 229.61 × 323.15 |
| `C8` | 57 × 81 mm | 161.57 × 229.61 |
| `C9` | 40 × 57 mm | 113.39 × 161.57 |
| `C10` | 28 × 40 mm | 79.37 × 113.39 |
| `4A0` | 1682 × 2378 mm | 4767.87 × 6740.79 |
| `2A0` | 1189 × 1682 mm | 3370.39 × 4767.87 |
| `RA0` | 860 × 1220 mm | 2437.8 × 3458.27 |
| `RA1` | 610 × 860 mm | 1729.13 × 2437.8 |
| `RA2` | 430 × 610 mm | 1218.9 × 1729.13 |
| `RA3` | 305 × 430 mm | 864.57 × 1218.9 |
| `RA4` | 215 × 305 mm | 609.45 × 864.57 |
| `SRA0` | 900 × 1280 mm | 2551.18 × 3628.35 |
| `SRA1` | 640 × 900 mm | 1814.17 × 2551.18 |
| `SRA2` | 450 × 640 mm | 1275.59 × 1814.17 |
| `SRA3` | 320 × 450 mm | 907.09 × 1275.59 |
| `SRA4` | 225 × 320 mm | 637.8 × 907.09 |
| `JIS-B0` | 1030 × 1456 mm | 2919.69 × 4127.24 |
| `JIS-B1` | 728 × 1030 mm | 2063.62 × 2919.69 |
| `JIS-B2` | 515 × 728 mm | 1459.84 × 2063.62 |
| `JIS-B3` | 364 × 515 mm | 1031.81 × 1459.84 |
| `JIS-B4` | 257 × 364 mm | 728.5 × 1031.81 |
| `JIS-B5` | 182 × 257 mm | 515.91 × 728.5 |
| `JIS-B6` | 128 × 182 mm | 362.83 × 515.91 |
| `JIS-B7` | 91 × 128 mm | 257.95 × 362.83 |
| `JIS-B8` | 64 × 91 mm | 181.42 × 257.95 |
| `JIS-B9` | 45 × 64 mm | 127.56 × 181.42 |
| `JIS-B10` | 32 × 45 mm | 90.71 × 127.56 |
| `Letter` | 8.5 × 11 in | 612 × 792 |
| `Legal` | 8.5 × 14 in | 612 × 1008 |
| `Executive` | 7.25 × 10.5 in | 522 × 756 |
| `Folio` | 8.5 × 13 in | 612 × 936 |
| `Tabloid` | 11 × 17 in | 792 × 1224 |
| `Ledger` | 11 × 17 in | 792 × 1224 |
| `ID1` | 53.98 × 85.6 mm | 153.01 × 242.65 |

`A`, `B`, `C`, `2A0` and `4A0` are ISO 216, `RA` and `SRA` are ISO 217, and `JIS-B` is the Japanese B series, spelled as in CSS Paged Media (`jis-b5`). `ID1` is the credit card size.

`Ledger` follows CSS Paged Media: it is the same 11 × 17 in sheet as `Tabloid`, portrait. The traditional ledger is the landscape form, 1224 × 792: write `size="Ledger" orientation="landscape"`.

`orientation` is `portrait` (the default) or `landscape`. Landscape swaps width and height.

Size names match in any case at run time, so `a4`, `A4` and `jis-b5` all work in a size that comes from data. The `PageSize` type lists the spellings in the table, so a type-checked template or binding should use those. An unknown name, or a pair with a value that is not a positive number, fails with `ngpdf: unknown page size "<size>" on pdf-page`.

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

## Image resolution (dpi)

`dpi` sets the resolution that images on the page are printed at. The default is 72, where one image pixel is 1pt. An image with no `width` and no `height` that is N pixels wide takes N × 72 / dpi points, so on a 300 dpi page a 600-pixel image is 144pt (2in) wide:

```html
<pdf-page size="Letter" dpi="300">
  <pdf-image [src]="scan" />
</pdf-page>
```

Images with a `width` or a `height` keep the size you gave them, and the cap to the width available still applies. `dpi` changes nothing else on the page:

- `px` in styles stays 1pt, as in CSS for print.
- No `/UserUnit` is written, so the page keeps its size in points and viewers show it at its real size.

The resolution stored in the image file itself (JPEG density, PNG `pHYs`) is not read. A value that is not a finite number above 0 fails with `ngpdf: invalid dpi "<value>" on pdf-page`. A dpi so small that an image without a size would be too large to lay out fails with `ngpdf: pdf-image natural size is too large at dpi <dpi>; set a width or a larger dpi`.

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
