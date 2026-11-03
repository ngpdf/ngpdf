---
'@ngpdf/core': patch
---

Units that fill the content area exactly now stay on the sheet. Yoga's float32 rounding could put their bottom slightly past the page, by more on tall pages and with many units, which moved the last one onto an extra sheet. A unit may now end up to 1/131072 of the content height past the bottom (0.001pt at least). On every named page size a unit that is over by 0.01pt or more still moves.

A table header that can't go on a page with the table's first row, because that row fits a page only without it and can't split, is now drawn once as ordinary rows, with a warning in development mode. It used to be left off that row's page, so a table with no row that fits under it lost its header entirely.

A table row that fits a page only without its header no longer has a piece cut at the bottom when no break in it fits below the header. It used to be split anyway, with the first piece drawn past the bottom of the sheet; it now goes whole on a sheet of its own, without the header and with a warning in development mode, and a header that can't go on a page with such a first row is drawn once, as above.
