---
'@ngpdf/core': patch
---

`padding: auto`, and `auto` on a `padding-*` side, now throw an `ngpdf:` error instead of becoming 0, since CSS has no `auto` padding.
