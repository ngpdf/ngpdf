---
'@ngpdf/core': patch
---

Reads numbers in exponent form, such as `1e-7`, `1.5E3` or `1.2e-15pt`, in every style that takes a length, a number or an angle. A binding turns a number into text with `String(n)`, which writes values below 1e-6 and from 1e21 up this way, so `[style.left.pt]="Math.sin(Math.PI) * 10"` or `[style.opacity]="1e-7"` threw before and now render. An `e` with no digit after it is still part of the unit, so `3em` still throws `unknown unit`. A length that overflows, such as `1e999`, now throws `invalid length "1e999" (not a finite number)` instead of `unknown unit`, and so does one that only overflows once its unit is applied, such as `1e308in`. An angle that overflows the same way, such as `rotate(1e308turn)`, throws `invalid angle`.
