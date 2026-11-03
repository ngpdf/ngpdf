---
'@ngpdf/core': patch
---

Units that fill the content area exactly now stay on the sheet. Yoga's float32 rounding could put their bottom slightly past the page, by more on tall pages and with many units, which moved the last one onto an extra sheet. A unit may now end up to 1/131072 of the content height past the bottom (0.001pt at least). On every named page size a unit that is over by 0.01pt or more still moves.
