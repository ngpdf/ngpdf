---
'@ngpdf/core': patch
---

A longhand such as `margin-top` now overrides an earlier shorthand such as `margin`, as in a browser. Before, `margin-top: 20; margin: 0; margin-top: 5` gave a top margin of 0, and a `[style.margin-top]` binding lost to a `margin` in the static `style`.
