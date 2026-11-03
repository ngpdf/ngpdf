---
'@ngpdf/core': minor
---

Adds `pdfPerSheet`, for content in a fixed header or footer that changes from sheet to sheet, such as "Continued on next page" on every sheet but the last and "End of report" on the last. Put `<ng-template pdfPerSheet let-sheet let-total="total">` inside a `pdf-view` with `fixed="top"` or `fixed="bottom"`; the template also gets `first`, `last` and `page`, the `pdf-page` the sheet comes from. It comes with `PDF_ELEMENTS`. The template renders like the rest of the document, with pipes, inputs and services, once per sheet. The view keeps the height of the template's content for a one-sheet document; content taller than that on a later sheet is cut and warns in development mode, so give the view a `height` when its content varies. A `pdfPerSheet` template anywhere but inside a fixed view fails the render.
