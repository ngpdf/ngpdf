---
'@ngpdf/core': minor
---

A long `pdf-text` now breaks between its lines at a page break instead of moving to the next page
whole, or being clipped when taller than a page. `orphans` and `widows` (default 2) set the fewest
lines kept before and after the break. A text keeps the old behaviour, moving whole, when it has
`break-inside: avoid`, a fixed `height` or a `max-height`, or when it sits inside a table row or a
row `pdf-view`.
