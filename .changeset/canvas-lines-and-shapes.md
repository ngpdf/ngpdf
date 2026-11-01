---
'@ngpdf/core': minor
---

Adds `pdf-canvas`, for charts, signature lines and other shapes. Put `<pdf-canvas [paint]="draw" style="height: 120" />` where a `pdf-view` can go, and draw in `draw(ctx, size)` with lines, curves, rectangles, circles, ellipses and polygons, filled or stroked, with dashes, line caps and joins, colors, opacity and transforms. Coordinates are in points from the top left of the canvas's content box, and the drawing is clipped to it. The function runs once per render, after layout, with the canvas's final size, and a canvas in a fixed header or a repeated table header is drawn on every sheet. A canvas is never split across pages. A non-finite number, an unknown option, too many calls or an error thrown by the function rejects the render with an `ngpdf: pdf-canvas` error. The `PdfCanvasContext` and `PdfCanvasPaint` types are exported.
