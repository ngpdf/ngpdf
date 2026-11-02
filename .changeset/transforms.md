---
'@ngpdf/core': minor
---

Elements can now be rotated, scaled and moved with `transform` and `transform-origin`, as in CSS, without changing the layout around them. A transformed column `pdf-view` or `pdf-text` is kept whole on one sheet, and one taller than the sheet's content area is cut at the bottom of that area, with a warning in development mode. `transform` has no effect on `pdf-span`, `pdf-page` or `pdf-table`, and `skew()`, `matrix()` and 3D functions throw. See [Transforms](https://ngpdf.dev/docs/layout-and-styling#transforms) for the full syntax.
