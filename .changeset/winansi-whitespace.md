---
'@ngpdf/core': patch
---

Vertical tab, form feed, the Ogham space mark (U+1680), the ideographic space (U+3000) and the line and paragraph separators (U+2028, U+2029) are now drawn as a normal space, and U+FEFF is removed. Before, a standard font drew them as `?` in the middle of a line, while the same characters at the ends of a paragraph were trimmed as whitespace.
