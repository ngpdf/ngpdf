---
'@ngpdf/core': patch
---

Units that fill the content area exactly now stay on the sheet. Yoga's float32 rounding could put their bottom a few hundred-thousandths of a point past the page, which moved the last one onto an extra sheet. A unit that is over by 0.01pt or more still moves.
