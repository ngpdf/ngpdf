---
'@ngpdf/core': minor
---

Add the `pdf-span` element to style part of a text, such as one bold word in a sentence:
`<pdf-text>Total: <pdf-span style="font-weight: bold">{{ total }}</pdf-span></pdf-text>`. A span
can change the color, font family, size, weight, style and decoration; the paragraph still wraps as
one text, and runs of different sizes share a baseline. Characters drawn in a fallback font now
share the baseline of the text around them instead of its top.
