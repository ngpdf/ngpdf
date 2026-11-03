---
'@ngpdf/core': minor
---

Adds `maxImageBytes`, a render option next to `inputs` that caps the size of images fetched from a URL. A response whose `Content-Length` is over the cap is refused before its body is read; otherwise the download stops as soon as the bytes read pass the cap, and the render rejects with `ngpdf: could not load image "<url>": larger than N bytes`. `PdfRenderer`, `renderToBlob`, `downloadPdf`, `pdfResource` and `renderToBuffer` take it, `PdfDownload` takes `pdfMaxImageBytes` and `pdf-viewer` takes `maxImageBytes`. On the server it checks what `fetchImage` returns. Data URLs and bytes are not counted. There is no cap by default.
