---
'@ngpdf/core': minor
---

`pdf-page-number` now works anywhere in a page, not only as a direct child of `pdf-page`. Put it in
a fixed header to show "Page 2 of 5" on every sheet, or anywhere in the content to show the number
of the sheet it lands on. A direct child of `pdf-page` still reserves the bottom of every sheet as
before.
