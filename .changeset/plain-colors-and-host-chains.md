---
'@ngpdf/core': patch
---

`rgb()` and `rgba()` now throw an `ngpdf: invalid color` error on hexadecimal, binary or octal channel values such as `0x10`, `0b1` and `0o7`, which CSS does not accept. Documents with deeply nested component hosts now render without a stack overflow. Styles on the host of the document component you render do not affect the PDF: style its `pdf-document` or `pdf-page` instead.
