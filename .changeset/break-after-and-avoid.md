---
'@ngpdf/core': minor
---

`breakAfter` on `pdf-view` and `pdf-text`, and the style `break-after: page` on any element but a `pdf-span`, start a new sheet after that element. Like `breakBefore`, it applies to a whole row when set inside one, and it never adds a blank sheet at the end of a page.

`break-inside: avoid` now works on a column `pdf-view` and a `pdf-table` too. One that doesn't fit in the space left on a sheet but fits on a whole sheet moves to the next sheet in one piece. One taller than a sheet splits as before.
