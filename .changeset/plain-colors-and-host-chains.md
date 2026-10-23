---
'@ngpdf/core': patch
---

`rgb()` and `rgba()` throw on a channel written as `0x10`, `0b1` or `0o7`, as CSS does, where they read it as a number. A document whose components nest very deeply no longer overflows the stack while ngpdf looks through their hosts. Styles on the host of the document component you render do not affect the PDF: style its `pdf-document` or `pdf-page` instead.
