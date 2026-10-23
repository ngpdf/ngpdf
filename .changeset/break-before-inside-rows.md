---
'@ngpdf/core': patch
---

`break-before: page` on an element inside a table row or a row `pdf-view`, such as a `pdf-cell`, now starts a new page before that whole row. A `breakBefore` input on an inner `pdf-view` or `pdf-text` does the same. These breaks did nothing before.
