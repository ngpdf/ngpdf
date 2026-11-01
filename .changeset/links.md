---
'@ngpdf/core': minor
---

Adds `pdf-link`, which makes text or a box open a URL when a reader clicks it in a PDF viewer. Put `<pdf-link [href]="url">` around a block, or use it inside a `pdf-text` for inline text. Only absolute `http:`, `https:` and `mailto:` URLs become links. Any other URL, a relative or invalid one, or a missing one draws the content without a link and warns in development mode. A link does not change how the content looks. A `pdf-link` inside another `pdf-link` throws an error.
