---
'@ngpdf/core': patch
---

A broken or cut-off PNG in a `pdf-image` now rejects the render with `ngpdf: could not load image "<src>": the image data is corrupt or cut off`. Before, a PNG with transparency whose pixel data was damaged made the render hang with an uncaught error. A damaged emoji image is drawn as text instead.
