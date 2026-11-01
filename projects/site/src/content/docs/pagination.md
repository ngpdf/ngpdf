---
title: Pagination
description: How ngpdf breaks content into pages - pagination units, table rows taller than a page, text that breaks between lines with orphans and widows, repeated table headers, breakBefore, breakAfter, keeping a view or table together and pdf-page-number formats.
section: Guide
order: 6
---

You do not place page breaks by hand. ngpdf lays out each `pdf-page` at its content width with unbounded height, then cuts the result into sheets of the page's size. This page explains where it cuts.

## Units

ngpdf moves content between pages in whole units. A unit is never split, but a long `pdf-text` is cut into several units, so it can break between its lines (see [Text across pages](#text-across-pages)), and a table row taller than a page splits between the lines of its cells (see [Rows taller than a page](#rows-taller-than-a-page)).

Starting from the children of the `pdf-page`, ngpdf looks inside some elements and treats others as units:

| Element | Treated as |
| --- | --- |
| `pdf-view` or block `pdf-link` with `flex-direction: column` (the default) and children | a wrapper: its children are looked at in turn |
| `pdf-view` with a `transform` | one unit, with everything inside it, so it is never cut across sheets |
| `pdf-view` with `overflow: hidden`, `clip`, `scroll` or `auto` | one unit, with everything inside it, so its clip is never split |
| `pdf-table` | a wrapper: each of its rows is a unit; a row taller than a page splits instead (see [Rows taller than a page](#rows-taller-than-a-page)) |
| `pdf-view` with `flex-direction: row` | one unit, with everything inside it |
| `pdf-text` | its lines, grouped by `orphans` and `widows`; one unit if it is short, has `break-inside: avoid`, a fixed height, a `transform` or an `overflow` other than `visible` |
| `pdf-row`, `pdf-image`, an empty `pdf-view` or one that holds only absolute elements and notes | one unit |
| an element with `position: absolute` | never a unit; see [Positioned elements](#positioned-elements) |
| `pdf-note` | never a unit; see [Notes](#notes) |

Wrappers can nest to any depth, so a table inside a column `pdf-view` inside another column `pdf-view` still yields its rows as units. A table inside a cell or inside a row `pdf-view` is part of that unit.

When the next unit does not fit below the previous one, it moves to the top of a new sheet. The vertical space between units (margins, gaps, the padding of wrappers) is kept as it was in the layout, except that a unit moved to a new sheet starts at the top of the content area. The bottom padding and border of wrappers that close right after a unit move with that unit.

If the page's own `flex-direction` is `row`, its whole content is one unit.

### Keep units small

A row `pdf-view` or a `pdf-view` with a `transform` or an `overflow` other than `visible` is never split, with everything inside it, text included. A table row is split only when it is taller than a page. Avoid wrapping long lists in a row `pdf-view`.

## Text across pages

A `pdf-text` that is a unit by the rules above, as a child of the page or of a column `pdf-view`, can break between two of its lines, as a paragraph does in CSS:

```html
<pdf-text style="orphans: 3; widows: 2">{{ longParagraph() }}</pdf-text>
```

- `orphans` is the fewest lines left at the bottom of a page before the break, and `widows` the fewest carried to the top of the next. Both are integers of at least 1, are inherited, and default to 2.
- A text cut by `max-lines` splits the same way, over the lines it keeps.
- A text with fewer than `orphans + widows` lines moves to the next page whole, as do texts with `break-inside: avoid`, a fixed `height`, a `max-height`, a `transform` or an `overflow` other than `visible`.
- A text longer than a page continues over as many pages as it needs. The first `orphans` and last `widows` lines always stay together, and a page in the middle keeps at least as many lines as the larger of the two. Each page takes as many lines as fit while the rest can still be laid out that way, so with lines of very different heights, such as a very large `pdf-span`, a page can end early or the text can start on the next page.
- When no layout keeps those limits, because a few lines are taller than most of a page, lines are placed one by one between the first and last groups, and a page in the middle can have fewer lines.
- Its top padding and border stay with its first lines, the bottom ones with its last lines. A background or border is sliced like a [wrapper's](#wrapper-backgrounds-and-borders).
- A `pdf-text` inside a row `pdf-view` is part of that unit and does not break. Inside a table row, it breaks only when the row is taller than a page, as described below.

### Rows taller than a page

A table row that fits on an empty page (below its repeated header, if the table has one) moves to the next page whole, as any unit. A row taller than that splits across sheets instead of being cut:

- It starts on the current sheet when at least one line of each non-empty cell fits there, and otherwise on the next sheet.
- Each cell breaks on its own: between the lines of its texts, or between the children of a column `pdf-view` inside it, at the last break that fits. The next sheet carries on from there, under the repeated header.
- `orphans` and `widows` don't apply inside a split cell: any line can end a piece.
- Content that can't break, such as an image, a row `pdf-view`, a table or a box with a fixed height, moves whole to the next piece. One taller than a page is clipped, with the warning below.
- Every piece of the row is as tall as its tallest cell piece on that sheet, so the borders of the cells line up. Cell and row backgrounds and borders are sliced like a [wrapper's](#wrapper-backgrounds-and-borders): no border is drawn at a cut, and the top padding stays with the first piece.
- Every cell of a split row is drawn from the top of each piece and stretched to its height: `align-items` on the row, `align-self` on a cell, and the space that `justify-content` adds above a cell's content are ignored.
- An absolute element inside a split row is drawn on the sheet where its top lands, and cut at the bottom of that sheet.

`break-inside: avoid` on the row keeps it one unit, clipped as below. So does a fixed `height` or `max-height`, a `transform` or an `overflow` other than `visible` on the row. Header rows never split.

### Units taller than a page

A unit taller than the content area goes on a sheet of its own and is clipped at the bottom of the content area. In development mode ngpdf logs a warning such as:

`ngpdf: pdf-view is taller than a page and is cut at the bottom`

Text lines that would cross the cut are not drawn, and images, backgrounds and side borders are cut at it. A `pdf-text` that can break between lines, and a table row whose cells can, continue on the next page instead. Only a group of lines that is itself taller than the content area, such as one line in a very large `pdf-span`, is still clipped.

## Wrapper backgrounds and borders

A column `pdf-view` or a `pdf-table` with a background or a border that runs across several sheets is sliced: each sheet draws the part that holds its units. The bottom border is not drawn at the cut, and the top border is not drawn on the continued part, so the box reads as one box across pages.

A block `pdf-link` is sliced the same way: each sheet gets one clickable area over the part of the link on it.

## Repeated table headers

A `pdf-row` with the `header` attribute repeats at the top of every sheet its table runs onto. See [Tables](/docs/tables#header-rows) for the cases where it is not repeated.

## breakBefore

`breakBefore` on a `pdf-view` or `pdf-text` starts a new sheet before that element. On any element but a `pdf-span`, the style `break-before: page` does the same. Inside a unit, a break starts the new sheet before that whole unit, since a unit is never split: `break-before: page` on a `pdf-cell` in a table row, or `breakBefore` on a `pdf-text` inside a row `pdf-view`.

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

## breakAfter

`breakAfter` on a `pdf-view` or `pdf-text`, or the style `break-after: page` on any element but a `pdf-span`, starts a new sheet after that element. It works like `breakBefore` turned around:

- On a wrapper, the next sheet starts after its last unit. A split `pdf-text` breaks after its last line, never between its lines.
- Inside a unit, the break comes after the whole unit: `break-after: page` on a `pdf-cell` breaks after its row.
- When nothing follows on that `pdf-page`, it does nothing, so the last element never adds a blank sheet.
- `break-after: avoid` or `avoid-page` keeps the element with what follows instead; see [Keeping a heading with what follows](#keeping-a-heading-with-what-follows). Other values do nothing.

## Keeping a view or table on one sheet

`break-inside: avoid` on a column `pdf-view` or a `pdf-table` keeps it on one sheet when it can:

```html
<pdf-view style="break-inside: avoid">
  <pdf-text style="font-weight: bold">Totals</pdf-text>
  <pdf-table [columns]="['1fr', 80]">…</pdf-table>
</pdf-view>
```

- If it does not fit in the space left on the sheet but fits on a whole sheet, it moves to the next sheet in one piece. A table's header is drawn once, above its first row.
- If it is taller than a sheet, it splits as it would without `avoid`: it is not clipped and there is no warning. A table's header repeats as usual.
- Wrappers that close with it count: the bottom padding and border of a view that ends with it must fit too.
- When kept views nest, the outermost one that fits on a sheet is kept. If the outer one is too tall, a view inside it can still be kept on its own.
- A `pdf-view` or `pdf-table` inside a row is already part of that row's unit, so `avoid` changes nothing there. On a `pdf-text`, `avoid` keeps the text as one unit, as described in [Text across pages](#text-across-pages).

## Keeping a heading with what follows

`break-after: avoid` (or `avoid-page`) keeps an element on the same sheet as what comes after it, so a heading does not end a sheet alone, except in the cases listed below:

```html
<pdf-text style="font-size: 14; font-weight: bold; break-after: avoid">Totals</pdf-text>
<pdf-text>The figures below cover the whole year…</pdf-text>
```

- When the unit after it does not fit in the space left, the element moves to the next sheet with it.
- When that unit is a `pdf-text` split across sheets, only its first lines need to fit: the first `orphans` lines. When it is a table, its first row and its header.
- On a column `pdf-view`, it applies to the view's last unit, and on a split `pdf-text` to its last lines. Inside a unit, such as a cell in a row, it applies to the whole row.
- Elements in a row that all have `avoid`, such as a heading and a subheading, move together with the unit after the last one.
- When the whole group would not fit on an empty sheet, `avoid` does nothing and the sheet breaks as usual, so it never pushes a sheet's worth of content forward.
- A page break asked for between them wins, and an element already at the top of a sheet stays there.
- The last lines of a `pdf-text` that began on an earlier sheet stay where the text's own breaks put them, so `orphans` and `widows` still hold. What follows moves alone.
- A view or table with `break-inside: avoid` after it counts with its whole height.
- It is a style only; there is no input for it, and it is not inherited.

## Positioned elements

An element with [`position: absolute`](/docs/layout-and-styling#positioning) is never a unit. It never moves, splits or pushes other units, and page breaks asked for on it or inside it do nothing.

- When its containing block is one unit (a row `pdf-view`, or a view with a `transform` or an `overflow` other than `visible`), it is drawn with that unit, on the same sheet.
- When its containing block is split across sheets (a column `pdf-view`, a `pdf-table` or the page itself), it goes on the sheet where its own top lands, moved like the units around it. One whose top falls in the space a page break skips goes to the top of the next sheet, and one below all the units gets a sheet of its own. It is never drawn above the top of the content area.
- It is never split: one taller than what is left of its sheet is cut at the bottom, with a dev-mode warning.
- Against the page, `bottom` and percentages of the height are measured on the page's whole content, all sheets together, not on one sheet.
- Inside a [fixed view](#fixed-headers-and-footers) it is drawn with the view on every sheet, and the view is its containing block.
- A `position: relative` element is placed like any other: pagination ignores its offsets, which only move it when it is drawn. A relative column `pdf-view` that is split moves each of its pieces by its offsets.

## Notes

A [`pdf-note`](/docs/elements#pdf-note) takes no space and is never a unit of its own. A note in the flow never adds a sheet: it goes on a sheet that other content already needs. A page with nothing but notes still gets its one sheet, as an empty page does.

- It goes on the sheet of the content right after it, at the top of where that content starts. When that content moves to the next sheet, or a `breakBefore` or `breakAfter` sends it there, the note goes with it.
- When it is the last child of its parent, it goes on the sheet of the content before it, at its bottom.
- Inside a unit, such as a row `pdf-view`, it is drawn with that unit.
- Inside a [table row split across sheets](#rows-taller-than-a-page), it goes on the piece where its point falls: with the content after it at a break, or on the last piece of its cell when it is that cell's last child. A note right after a split row goes on the row's last piece, at its bottom.
- Inside a [fixed view](#fixed-headers-and-footers) it is written on every sheet.
- With `position: absolute` it follows the rules of [positioned elements](#positioned-elements) instead, so one placed below all the content gets a sheet of its own.

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
- A fixed view is never a pagination unit: it is not split, moved or clipped, and page breaks on it or inside it (`breakBefore`, `breakAfter`, `break-before`, `break-after`) do nothing.
- A fixed view can have a `transform`, such as a header turned along the page edge. It is drawn transformed on every sheet, and the flow keeps the space of its untransformed box.
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
- It sits at the bottom of the content area, inside the page padding, across the content width, on every sheet that `pdf-page` produces. It is taken out of the flow wherever you write it among the page's children, so `break-before` and `break-after` on it do nothing.
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
