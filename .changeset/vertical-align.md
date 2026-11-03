---
'@ngpdf/core': minor
---

A `pdf-span` now takes `vertical-align: baseline | super | sub | <length> | <percentage>` for superscripts and subscripts such as m², H₂O and footnote markers. `super` raises the span by 0.33em and `sub` lowers it by 0.2em of the font size around it, and both draw it at 70% of that size unless the span sets its own `font-size`. A length raises the text by that amount (negative lowers it) and a percentage is of the span's line height; neither changes the size. A nested span moves with the span around it. A line grows when a moved run sticks out of it, and the underline, strike and link area of the span move with its text. `vertical-align` used to be ignored everywhere; on an element other than a `pdf-span` it is still ignored, now with a development-mode warning, and a keyword such as `middle` throws.
