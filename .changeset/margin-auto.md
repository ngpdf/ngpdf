---
'@ngpdf/core': minor
---

A `pdf-view` with `fixed="top"` or `fixed="bottom"` now takes its own `width` and places itself with `auto` left and right margins, so `width: 200; margin: 0 auto` centres a header and `margin-left: auto` pushes a footer to the right. A fixed view used to be laid out at the full content width less its margins whatever its `width`, so a document that sets `width` on one now draws it at that width. In the flow, `auto` margins already worked through Yoga, and the docs now say so: `margin: 0 auto` centres a box with a width, `margin-left: auto` pushes a row item to the end, and a box with `margin-top: auto` in a column split across sheets keeps the position it had in the unsplit layout.
