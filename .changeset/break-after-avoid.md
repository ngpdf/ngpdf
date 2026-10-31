---
'@ngpdf/core': minor
---

`break-after: avoid` (or `avoid-page`) keeps an element on the same sheet as what follows it, so a heading no longer ends a sheet alone in most cases. When the next unit does not fit, the element moves to the next sheet with it. For a split text, only its first lines need to fit. Several elements in a row with `avoid` move together. An element already at the top of a sheet stays there, and a group that would not fit on an empty sheet is left where it is, so in those cases a heading can still end a sheet.
