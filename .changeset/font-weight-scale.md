---
'@ngpdf/core': minor
---

`font-weight` now takes any number from 1 to 1000 and the names `thin` (100), `extralight` (200), `light` (300), `normal` (400), `medium` (500), `semibold` (600), `bold` (700), `extrabold` (800) and `black` (900), and `bolder` and `lighter` follow the CSS table from the inherited weight. `providePdfFonts` takes a numeric `weight` per face, so a family registered with Light, Medium or Black faces can use them; `'normal'` and `'bold'` still work as 400 and 700. When a family has no face for a weight, ngpdf picks one as CSS font matching does, and the development warning names the face it drew with.

Two things change for existing documents. An unknown `font-weight` value such as `heavy` used to draw normal text and now throws `ngpdf: invalid value "heavy" for font-weight on <element>`, with the allowed values in the message. The standard fonts are drawn bold above 500 rather than from 600, which only changes numbers between 501 and 599.
