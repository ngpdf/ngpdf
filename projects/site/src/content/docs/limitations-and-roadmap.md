---
title: Limitations and roadmap
description: What ngpdf v0.1 does not do yet, from fonts and page numbers to tables and images, and what is planned for the v0.2 release of @ngpdf/core.
section: Project
order: 14
---

ngpdf v0.1 covers documents built from text, tables, boxes and images. This page lists what it does not do yet, and what is planned next.

## v0.1 limits

### Text and fonts

- In the standard PDF fonts (Helvetica, Times and Courier), only WinAnsi characters: any other is drawn as `?`, with a warning in development mode. [Custom fonts](/docs/text-and-fonts#custom-fonts) have no such limit.
- No font collections (`.ttc`), no color emoji fonts, and no kerning across two fonts in one line.
- Text sits at the top of its line box: extra `line-height` goes below the text, not half above and half below as in CSS.
- A bare number is in points, except in `line-height`, where it multiplies the font size as in CSS (`line-height: 1.4`). Write `line-height: 14pt` for points.
- Bare text inside an element other than `pdf-text` (`<pdf-cell>{{ x }}</pdf-cell>`) is laid out as an anonymous `pdf-text` with its parent's text styles.
- No hyphenation and no right-to-left text. Justified text widens only the gaps between words, never the space between letters.

### Layout and styling

- Colors are hex (3, 4, 6 or 8 digits), `rgb()`/`rgba()`, the CSS named colors and `transparent`. Other forms, such as `hsl()`, throw.
- Children and images of a rounded view are not clipped to its corners.
- `opacity` multiplies down the tree: a faded view's children are each faded, not composited as one group, so overlapping children show through each other.
- A box cannot fill the remaining height of a page. Use a fixed height.
- Your own components inside a document are transparent, like `display: contents`. Styles on a component's host element are ignored with a warning. Style a `pdf-*` element inside it instead. The same goes for the document component you render.

### Tables

- Inside a `pdf-table`, horizontal padding, borders and margins on a row are ignored. Put horizontal padding on the `pdf-cell`s.
- A table header row is not repeated on a page whose first row fits only without it.

### Pagination

- A unit taller than a page (a row, or a `pdf-view` in a column) is clipped to its page. So is a `pdf-text` that stays one unit: one inside a row, or one with `break-inside: avoid`, a fixed `height` or `max-height`, or fewer than `orphans + widows` lines. Other text breaks between lines instead.

### Images

- PNG and JPEG only.
- Images fetched from a URL have no size limit; a very large image is downloaded in full.

### Not in v0.1

- Server rendering. Render in the browser.
- SVG, links and bookmarks.
- Forms and encryption.
- A preview component.
- Capturing the DOM of a page as a PDF.

## Planned for v0.2

These items are in the [v0.2 roadmap](https://github.com/ngpdf/ngpdf/blob/main/docs/roadmap-v0.2.md). Items that change behaviour go through a design update first, so details may change.

### Layout

- Fill the remaining page height.
- Group opacity, so a faded view is composited as one.
- Half-leading: extra line height split above and below the text, as in CSS.
- Table headers: a warning or a fix when a header is dropped or too tall to repeat, and `breakBefore` kept on header rows.

### Images

- A size cap on fetched images.
- Cancelling the other image downloads when one fails.

### Robustness

- One policy for unknown keywords, fallback or throw (still to be decided). Today `font-weight` and `font-style` fall back to `normal`, `break-before`, `break-after` and `break-inside` ignore them, and the other keyword properties throw.

Ideas and bug reports are welcome on [GitHub issues](https://github.com/ngpdf/ngpdf/issues).
