---
'@ngpdf/core': patch
---

`break-before: page` on a repeated table header row, or on an element inside it, now starts a new page before the table's first row instead of being ignored. A table header that is not repeated because its rows are taller than a page together, or that is left off a page whose first row fits only without it, now warns in development mode.
