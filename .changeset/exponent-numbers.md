---
'@ngpdf/core': patch
---

Styles that take a length, a number or an angle now accept exponent form, such as `1e-7`, `1.5E3` or `1.2e-15pt`. Numeric bindings write very small and very large values this way, so `[style.left.pt]="Math.sin(Math.PI) * 10"` or `[style.opacity]="1e-7"` now render instead of throwing. An `e` with no digit after it is still part of the unit, so `3em` still throws `unknown unit`. A length or angle too large to be a number, such as `1e999` or `1e308in`, throws `invalid length` (or `invalid angle` for `rotate(1e308turn)`). A huge but finite gradient angle, such as `linear-gradient(1e308deg, red, blue)`, now renders in the direction of that angle modulo 360.
