---
'@ngpdf/core': patch
---

Next line (U+0085) is now drawn as a normal space and collapses with the whitespace around it, like form feed, vertical tab and the line and paragraph separators. Before, a standard font drew it as `?`.
