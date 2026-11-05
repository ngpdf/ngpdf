---
'@ngpdf/core': minor
---

`pdf-page` `size` now takes lengths as well as points. Each side of `[width, height]` can be a number of points or a length string in `pt`, `px`, `in`, `cm` or `mm`, as in styles: `[size]="['210mm', '297mm']"`. One number or length makes a square page (`[size]="400"`, `size="400"`, `size="10cm"`), and the CSS `@page` form with two lengths works too: `size="210mm 297mm"`. `%`, `em`, `auto` and other units, a side that is zero, negative or not finite, and a string with more than two lengths fail with `ngpdf: unknown page size "<size>" on pdf-page`. A pair with more than two values, which was cut to its first two, now fails the same way. `orientation="landscape"` still always swaps width and height, for these sizes as for names.
