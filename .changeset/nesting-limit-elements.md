---
'@ngpdf/core': patch
---

A document nested exactly 64 elements deep now renders when its innermost element holds text or an `@if`/`@for` block. The limit counted that text as one more level and rejected the document with `ngpdf: nesting deeper than 64`, which made the real limit 63 for almost every template.
