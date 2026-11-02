---
'@ngpdf/core': minor
---

`transform` and `transform-origin` are supported. `transform` takes `none` or a list of `rotate()`, `scale()`, `scaleX()`, `scaleY()`, `translate()`, `translateX()` and `translateY()`, applied left to right around `transform-origin` (`center` by default), as in CSS. Angles take `deg`, `rad` or `turn`, and translations take lengths or a percentage of the element's own border box. The whole element is transformed when drawn, background, border, children, text and image, and the layout does not change. A column `pdf-view` with a transform and a transformed `pdf-text` are each one pagination unit, kept whole on one sheet; one taller than the sheet's content area is cut at the bottom, with a dev-mode warning. `transform` is ignored on `pdf-page` and `pdf-table`, and has no effect on a `pdf-span`, which is part of a line. `skew()`, `matrix()` and the 3D functions throw.
