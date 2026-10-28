---
'@ngpdf/core': patch
---

A `pdf-text` split over several pages no longer leaves a page in the middle with fewer lines than `orphans` and `widows` ask for when its lines have very different heights. A page gives lines back to the one before it, or the text starts on the next page, when that keeps the limits. When no layout keeps them, lines are placed one by one as before.
