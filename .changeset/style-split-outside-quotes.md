---
'@ngpdf/core': patch
---

A `;` inside quotes or parentheses in a `style` attribute no longer ends the declaration, so values
such as `url(data:image/png;base64,...)` or `font-family: "A;B"` are kept whole.
