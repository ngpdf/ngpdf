---
'@ngpdf/core': minor
---

Add the `pdfDownload` directive: `<button [pdfDownload]="Invoice" pdfFileName="invoice.pdf">`
downloads the document when clicked, marks the button busy and ignores clicks while it renders,
and reports a failed render through `(pdfError)` and the app's `ErrorHandler`.
