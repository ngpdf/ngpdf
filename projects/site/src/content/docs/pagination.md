---
title: Pagination
description: How ngpdf breaks content into pages - pagination units, rows that never split, text that breaks between lines with orphans and widows, repeated table headers, breakBefore and pdf-page-number formats.
section: Guide
order: 6
---

You do not place page breaks by hand. ngpdf lays out each `pdf-page` at its content width with unbounded height, then cuts the result into sheets of the page's size. This page explains where it cuts.

## Units

ngpdf moves content between pages in whole units. A unit is never split, but a long `pdf-text` is cut into several units, so it can break between its lines (see [Text across pages](#text-across-pages)).

Starting from the children of the `pdf-page`, ngpdf looks inside some elements and treats others as units:

| Element | Treated as |
| --- | --- |
| `pdf-view` with `flex-direction: column` (the default) and children | a wrapper: its children are looked at in turn |
| `pdf-table` | a wrapper: each of its rows is a unit |
| `pdf-view` with `flex-direction: row` | one unit, with everything inside it |
| `pdf-text` | its lines, grouped by `orphans` and `widows`; one unit if it is short, has `break-inside: avoid` or a fixed height |
| `pdf-row`, `pdf-image`, an empty `pdf-view` | one unit |

Wrappers can nest to any depth, so a table inside a column `pdf-view` inside another column `pdf-view` still yields its rows as units. A table inside a cell or inside a row `pdf-view` is part of that unit.

When the next unit does not fit below the previous one, it moves to the top of a new sheet. The vertical space between units (margins, gaps, the padding of wrappers) is kept as it was in the layout, except that a unit moved to a new sheet starts at the top of the content area. The bottom padding and border of wrappers that close right after a unit move with that unit.

If the page's own `flex-direction` is `row`, its whole content is one unit.

### Keep units small

A table row or a row `pdf-view` is never split, with everything inside it, text included. Avoid wrapping long lists in a row `pdf-view`.

## Text across pages

A `pdf-text` that is a unit by the rules above, as a child of the page or of a column `pdf-view`, can break between two of its lines, as a paragraph does in CSS:

```html
<pdf-text style="orphans: 3; widows: 2">{{ longParagraph() }}</pdf-text>
```

- `orphans` is the fewest lines left at the bottom of a page before the break, and `widows` the fewest carried to the top of the next. Both are integers of at least 1, are inherited, and default to 2.
- A text with fewer than `orphans + widows` lines moves to the next page whole, as do texts with `break-inside: avoid`, a fixed `height` or a `max-height`.
- A text longer than a page continues over as many pages as it needs. The first `orphans` and last `widows` lines always stay together. Lines are placed one by one between them, so a page in the middle of the text can end up with fewer than `orphans` lines only when its lines are so tall that fewer than `orphans + widows` of them fit on a page, such as a very large `pdf-span`.
- Its top padding and border stay with its first lines, the bottom ones with its last lines. A background or border is sliced like a [wrapper's](#wrapper-backgrounds-and-borders).
- A `pdf-text` inside a table row or a row `pdf-view` is part of that unit and does not break.

### Units taller than a page

A unit taller than the content area goes on a sheet of its own and is clipped at the bottom of the content area. In development mode ngpdf logs a warning such as:

`ngpdf: pdf-view is taller than a page and is cut at the bottom`

Text lines that would cross the cut are not drawn, and images, backgrounds and side borders are cut at it. A `pdf-text` that can break between lines continues on the next page instead. Only a group of lines that is itself taller than the content area, such as one line in a very large `pdf-span`, is still clipped.

## Wrapper backgrounds and borders

A column `pdf-view` or a `pdf-table` with a background or a border that runs across several sheets is sliced: each sheet draws the part that holds its units. The bottom border is not drawn at the cut, and the top border is not drawn on the continued part, so the box reads as one box across pages.

## Repeated table headers

A `pdf-row` with the `header` attribute repeats at the top of every sheet its table runs onto. See [Tables](/docs/tables#header-rows) for the cases where it is not repeated.

## breakBefore

`breakBefore` on a `pdf-view` or `pdf-text` starts a new sheet before that element. On any element, the style `break-before: page` does the same. Inside a unit, a break starts the new sheet before that whole unit, since a unit is never split: `break-before: page` on a `pdf-cell` in a table row, or `breakBefore` on a `pdf-text` inside a row `pdf-view`.

```html
@for (chapter of chapters(); track chapter.title; let first = $first) {
  <pdf-view [breakBefore]="!first">
    <pdf-text style="font-size: 18; font-weight: bold; margin-bottom: 8">
      {{ chapter.title }}
    </pdf-text>
    @for (paragraph of chapter.paragraphs; track $index) {
      <pdf-text style="margin-bottom: 6">{{ paragraph }}</pdf-text>
    }
  </pdf-view>
}
```

On a wrapper, the break happens before its first unit. A break on a sheet that has no units yet is ignored, so you never get a blank page.

## Fixed headers and footers

Give a `pdf-view` that is a direct child of `pdf-page` the `fixed` input to draw it on every sheet:

```html
<pdf-page style="padding: 36">
  <pdf-view fixed="top" style="flex-direction: row; margin-bottom: 12">
    <pdf-text style="flex: 1; font-weight: bold">Stock count</pdf-text>
    <pdf-text>Warehouse 7</pdf-text>
  </pdf-view>
  …
  <pdf-view fixed="bottom" style="margin-top: 8">
    <pdf-text style="font-size: 8">Made-up data</pdf-text>
  </pdf-view>
  <pdf-page-number />
</pdf-page>
```

- A fixed view is laid out once at the content width and drawn the same on every sheet that `pdf-page` produces. It is taken out of the flow wherever you write it among the page's children.
- `fixed="top"` views stack at the top of the content area, and `fixed="bottom"` views at the bottom, in template order, with their margins. The flow gets the space between them on every sheet.
- Bottom views sit above the `pdf-page-number`, which keeps the very bottom.
- A fixed view is never a pagination unit: it is not split, moved or clipped, and `breakBefore` inside it does nothing.
- Fixed views that leave no room for content fail the render with `ngpdf: fixed views leave no room for content on pdf-page`.
- A `fixed` view nested deeper than a direct child of `pdf-page` is laid out as an ordinary view where it is, and logs `ngpdf: a fixed pdf-view must be a direct child of pdf-page` in development mode: inside the flow it stays in the flow, and inside a fixed view it repeats with that view.
- The content of a fixed view is the same on every sheet, except a `pdf-page-number` inside it, which shows each sheet's number (see [Page numbers](#page-numbers)).

## Page numbers

A `pdf-page-number` shows the sheet's number. Put it directly inside a `pdf-page` to reserve the bottom of every sheet for it:

```html
<pdf-page style="padding: 48">
  …
  <pdf-page-number format="Page {page} of {total}" style="font-size: 8; color: #777777" />
</pdf-page>
```

- `format` replaces `{page}` with the sheet's number and `{total}` with the number of sheets in the whole document, across all `pdf-page` elements. Each token can appear any number of times. The default format is `{page} / {total}`.
- It sits at the bottom of the content area, inside the page padding, across the content width, on every sheet that `pdf-page` produces. It is taken out of the flow wherever you write it among the page's children.
- It reserves its height on every sheet: one line of its font (`font-size × line-height`) plus its own vertical padding and borders, or its `height` if you set one. Content and bottom fixed views stop above it.
- It is right-aligned unless it, or an element above it, sets `text-align`.
- Text styles apply: `font-size`, `color`, `font-weight` and the rest. Other position styles are ignored.
- The text is drawn on one line and does not wrap. Content you put inside the element is ignored.
- Only the first `pdf-page-number` among the direct children of a `pdf-page` reserves the bottom; other direct children are ignored. Page numbers placed anywhere else are drawn too.

### Anywhere else

A `pdf-page-number` that is not a direct child of `pdf-page` is laid out where you write it, like a one-line `pdf-text`, and shows the numbers of the sheet it is drawn on. In a fixed header, that is every sheet:

```html
<pdf-view fixed="top" style="flex-direction: row">
  <pdf-text style="flex: 1; font-weight: bold">Stock count</pdf-text>
  <pdf-page-number format="Sheet {page} of {total}" />
</pdf-view>
```

- The layout is done once for all sheets, so its box is measured with every `{page}` and `{total}` taken as three digits. The drawn text is aligned inside that box by `text-align`, so a number that grows from 9 to 10 does not move what is next to it.
- In the flow, it shows the number of the sheet its unit lands on. `{total}` is always the number of sheets in the whole document.
- Inside a `pdf-text` it is flattened like any other element there; put it next to the text instead, for example in a row `pdf-view`.

## Warnings

All of these warnings are printed with `console.warn` at the end of the render, once each, and only in development mode (when Angular's `ngDevMode` is on). Production builds print nothing.
