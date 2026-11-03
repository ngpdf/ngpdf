---
'@ngpdf/core': patch
---

A JPEG with a stray byte between two segments now loads at its frame size, as it does in a browser. It used to fail the render with `ngpdf: invalid JPEG marker`.
