---
'@ngpdf/core': minor
---

Elements can now be rotated, scaled and moved with `transform` and `transform-origin`, as in CSS, without changing the layout around them. A transformed box or text is kept whole on one sheet, and one taller than the sheet is cut at the bottom with a warning. `transform` has no effect on `pdf-span`, `pdf-page` or `pdf-table`, and `skew()`, `matrix()` and 3D functions throw. See [Transforms](https://ngpdf.dev/docs/layout-and-styling#transforms) for the full syntax.
