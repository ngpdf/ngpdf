---
'@ngpdf/core': minor
---

Add `max-lines` to cut a `pdf-text` to a number of lines. When text was cut, the last kept line ends with `…`, shortened until it fits the box, and the text is only as tall as the lines it keeps. A font without `…` gets `...` instead.
