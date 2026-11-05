---
'@ngpdf/core': patch
---

A `pdf-svg` or `pdf-canvas` with a huge but finite number no longer crashes the render with pdfkit's bare `unsupported number` error. Every number a drawing writes now stays within ±1e9 (about 350 km of page). Past that, a `pdf-svg` fails with `ngpdf: pdf-svg <rect> has the number 1e+22, past ±1e9`, naming the element, and a `pdf-canvas` with `ngpdf: pdf-canvas fill has the number …, past ±1e9`, naming the paint call. This covers path coordinates, shape sizes, stroke widths, dashes, gradient coordinates, transforms and a `viewBox` fitted at a huge scale. Each number is checked in its own coordinates, so a large drawing scaled down onto a page still renders. The writer checks every drawing operation, page size and gradient again before pdfkit sees it.
