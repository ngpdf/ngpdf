---
'@ngpdf/core': patch
---

Vertical tab, form feed and the line and paragraph separators (U+2028, U+2029) are now drawn as a normal space, and U+FEFF is removed. A standard font draws the ideographic space (U+3000) and the Ogham space mark (U+1680) as a space too, while a custom font that has them still draws its own glyph. Before, a standard font drew all of these as `?` in the middle of a line, while the same characters at the ends of a paragraph were trimmed as whitespace.
