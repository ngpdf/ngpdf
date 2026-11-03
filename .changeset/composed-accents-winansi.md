---
'@ngpdf/core': patch
---

An accented letter written as a base letter plus a combining mark, such as `e` followed by U+0301 (as macOS file names and some APIs send it), is now drawn as the composed letter (`é`) in the standard fonts instead of the letter followed by `?`, and no longer triggers the WinAnsi warning. In a `font-family` list, a font that lacks the letter as written but has its composed form draws the composed form. A custom font that has the combining mark draws the text as before.
