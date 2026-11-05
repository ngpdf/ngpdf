---
'@ngpdf/core': minor
---

`pdf-svg` draws `symbol`, so icon sprites made of `<symbol>` and `<use href="#id">` now show up instead of drawing nothing with a warning. A `symbol` is drawn only through a `use`, as a nested `svg`: its `viewBox` and `preserveAspectRatio` apply, it is placed at the `use`'s `x` and `y` and clipped to the `use`'s `width` and `height`, or else the `symbol`'s own, or else 100% of the drawing around it. The limits on `use` count each `symbol` drawn: 16 levels deep, 50,000 elements and the drawing budget.
