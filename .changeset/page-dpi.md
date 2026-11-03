---
'@ngpdf/core': minor
---

`pdf-page` takes a `dpi` input (72 by default) for documents made for print at a given resolution. An image on that page with no `width` and no `height` now takes 72 / `dpi` points per pixel, so a 600-pixel image on a `dpi="300"` page is 2in wide. This includes images in fixed views and `pdfPerSheet` content. Images with a size set keep it, `px` in styles stays 1pt, and the page keeps its size in points, so viewers show it at its real size. A `dpi` that is not a finite number above 0 throws `ngpdf: invalid dpi "<value>" on pdf-page`.
