---
'@ngpdf/core': minor
---

`dashed` and `dotted` borders are now drawn as dashes and dots instead of solid lines with a warning. Dashes are 3 times the border width long and dots are as wide as the border, about 2 widths apart, with the gaps fitted so each side starts and ends at its corners. A rounded box with four alike dashed or dotted sides is drawn as one outline, so the pattern runs on round the corners. `border-style` (1 to 4 values) and `border-top-style`, `border-right-style`, `border-bottom-style` and `border-left-style` set the style per side; before, they were ignored. A side whose style is `none` or `hidden` now has a width of 0 whatever order the declarations come in, so `border: none; border-width: 2` no longer draws a border. `double`, `groove`, `ridge`, `inset` and `outset` are still drawn solid with a warning.
