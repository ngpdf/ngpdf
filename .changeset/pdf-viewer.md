---
'@ngpdf/core': minor
---

Adds `pdf-viewer`, a live preview of a document, from the new entry point `@ngpdf/core/viewer`. `<pdf-viewer [document]="Invoice" [inputs]="{ invoice }" />` shows the PDF in the browser's own PDF viewer and renders it again, after a 300 ms pause by default, when `inputs` change. The previous PDF stays on screen while the next one renders. Content marked `pdfViewerLoading` shows until the first PDF is there, and content marked `pdfViewerError` shows when a render fails; `rendered` and `failed` emit the PDF and the error. Apps that don't import `@ngpdf/core/viewer` don't bundle it. Chrome on Android shows no PDF inside a page and Safari on iOS shows only the first page, so offer a download next to the preview. If your Content-Security-Policy sets `frame-src`, allow `blob:`.

`pdfResource`'s `url()` now keeps the previous PDF's URL while a newer render runs, instead of going `undefined` until it finishes.
