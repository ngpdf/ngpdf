---
'@ngpdf/core': minor
---

`transform` and `transform-origin` are supported. `transform` takes `none` or a list of `rotate()`, `scale()`, `scaleX()`, `scaleY()`, `translate()`, `translateX()` and `translateY()`, applied left to right around `transform-origin` (`center` by default), as in CSS. Angles take `deg`, `rad` or `turn`, and translations take lengths or a percentage of the element's own border box. The whole element is transformed when drawn, background, border, children, text and image, and the layout does not change. A column `pdf-view` with a transform is one pagination unit, and a transformed `pdf-text` stays whole on one sheet. `transform` is ignored on `pdf-page` and `pdf-table`. `skew()`, `matrix()` and the 3D functions throw.
