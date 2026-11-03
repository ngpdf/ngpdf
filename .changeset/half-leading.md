---
'@ngpdf/core': minor
---

Text now sits in the middle of its line, as in CSS: the extra space that `line-height` adds is split in half above and below the text (half-leading), where it used to go all below it. Text in a box with a large `line-height` moves down; with the default `line-height: 1.2`, Helvetica moves down by about 0.14 of its font size. A `line-height` smaller than the font's height moves text up. Line heights, box sizes and page breaks do not change, a link's clickable area still covers the whole line, and underlines and strike-throughs follow the text. In a line with spans of several sizes, the span that reaches highest sets the baseline. The page number is placed the same way.
