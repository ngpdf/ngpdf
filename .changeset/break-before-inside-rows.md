---
'@ngpdf/core': patch
---

`break-before: page` (or `breakBefore`) on an element inside a table row or a row `pdf-view`, such as a `pdf-cell`, now starts a new page before that whole row. It did nothing before.
