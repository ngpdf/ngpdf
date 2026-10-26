---
'@ngpdf/core': minor
---

A long `pdf-text` now breaks between its lines at a page break instead of moving to the next page
whole, or being clipped when taller than a page. `orphans` and `widows` (default 2) set the fewest
lines kept before and after the break, and `break-inside: avoid` keeps a text on one page as
before. Text inside a table row or a row `pdf-view` still moves with its row.
