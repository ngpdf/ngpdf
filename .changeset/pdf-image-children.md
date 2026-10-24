---
'@ngpdf/core': patch
---

A `pdf-image` with element children now rejects the render with
`ngpdf: pdf-image cannot have children (found <pdf-text>)`, naming the first child, before any
image is fetched. The error identifies the element you need to remove.
