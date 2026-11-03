---
'@ngpdf/core': patch
---

In a `pdf-table` with `flex-direction: row`, where the header rows sit beside the body rows, a fixed `row-gap` or `gap` no longer pushes a body row below its header. A row split across sheets now starts each piece beside the repeated header, at the header's top, as a percentage `row-gap` already did. When the header is taller than the room left on a sheet, the rows beside it move to the next sheet with it, so the header is not cut at the bottom.
