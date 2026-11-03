---
'@ngpdf/core': patch
---

A line cut by `max-lines` no longer ends in empty boxes when its last characters come from a font that has no `…`. The ellipsis is now drawn in the first font of the `font-family` list that has `…`, or `...` in the first one with `.` when none has `…`. A custom font that has `…` keeps drawing it itself, as before.
