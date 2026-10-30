---
'@ngpdf/core': minor
---

`break-after: avoid` keeps an element on the same sheet as what follows it, so a heading no longer ends a sheet alone. When the next unit does not fit, the element moves to the next sheet with it. For a split text, only its first lines need to fit. Several elements in a row with `avoid` move together, as long as the group fits on one sheet.
