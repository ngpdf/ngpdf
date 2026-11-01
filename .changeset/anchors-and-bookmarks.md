---
'@ngpdf/core': minor
---

Adds links to places inside the document, and bookmarks. Give a `pdf-view`, `pdf-text`, `pdf-image`, `pdf-table`, `pdf-row` or `pdf-cell` an `anchor` name, and `<pdf-link href="#name">` jumps to it, for example from a table of contents. A `bookmark` title on the same elements adds an entry to the PDF's bookmarks panel, nested as the elements are nested in the template. `pageMode` now also takes `UseOutlines`, which opens that panel when the PDF opens. A link to a name that no element has, or a second element with the same name, draws the content as usual and warns in development mode.
