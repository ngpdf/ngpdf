---
'@ngpdf/core': minor
---

New `white-space` property: `normal` (the default, unchanged), `nowrap`, `pre`, `pre-line` and `pre-wrap`, inherited and allowed on `pdf-span`, as in CSS. With `pre-line`, an address or note bound from data keeps its line breaks: `<pdf-text style="white-space: pre-line">{{ address }}</pdf-text>`. `pre` and `pre-wrap` also keep spaces, and tabs go to stops every 8 spaces. `nowrap` and `pre` do not wrap, and a line wider than its box overflows it. `white-space` was ignored before.
