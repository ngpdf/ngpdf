---
'@ngpdf/core': minor
---

Backgrounds can be gradients. `background-image` takes one `linear-gradient()` or `radial-gradient()`, and `background` becomes a shorthand for a color, a gradient, or both, with the color drawn under the gradient. Linear gradients take an angle (`deg`, `rad`, `turn`) or `to` a side or corner; radial ones take `circle` or `ellipse`, a size keyword and `at <position>`. Stops take any supported color and an optional position in `%` or a length, spread and ordered as in CSS. The gradient fills the border box, follows `border-radius`, and a view split across pages keeps one gradient for its whole height. `repeating-*` gradients, `conic-gradient()`, `url()` and several backgrounds throw an `ngpdf:` error.
