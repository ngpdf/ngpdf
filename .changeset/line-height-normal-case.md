---
'@ngpdf/core': patch
---

`line-height: normal` is now matched in any case, like every other keyword: `NORMAL` or `Normal` keeps the inherited line height instead of failing the render.
