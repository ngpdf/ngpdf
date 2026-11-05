---
'@ngpdf/core': minor
---

`pdf-page` takes `auto` as its height, for receipts and other slips with a fixed width: `[size]="[226, 'auto']"`, `['80mm', 'auto']` or `size="80mm auto"`. Each sheet is as tall as its content plus the page's padding and border, with bottom fixed views and the page number right after the content. A page break you ask for starts a new sheet sized to its own content. A sheet grows to at most 14400pt; taller content breaks onto more sheets, with a development-mode warning. `auto` as the width, or `orientation="landscape"` with an auto height, throws.
