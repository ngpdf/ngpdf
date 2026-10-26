---
'@ngpdf/core': minor
---

Add `pdfResource` to keep a PDF Blob and object URL current as document inputs change. It also
exposes loading and error state, revokes replaced URLs, and can debounce bursts of changes.
