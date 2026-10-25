---
'@ngpdf/core': minor
---

New `pdfResource(Document, { inputs })`: a signal-based PDF built on Angular's `resource()`. It
renders again when its inputs change, exposes the `Blob`, an object URL that is revoked for you,
and the loading and error state, and can debounce bursts of changes.
