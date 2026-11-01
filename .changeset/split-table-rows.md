---
'@ngpdf/core': minor
---

A table row taller than a page now splits across pages instead of being cut off at the bottom. Each cell breaks on its own, between the lines of its text or between the elements of a column `pdf-view` inside it, and the header row repeats above every piece. The cells of every piece are as tall as each other, so their borders line up, and backgrounds and borders are sliced with no border drawn at a cut. Content that can't break, such as an image, moves whole to the next page, or is cut at the bottom when it is taller than a page. A split row draws its cells from the top, so vertical alignment inside it is ignored. Rows that fit on a page are placed as before. `break-inside: avoid` on a row keeps the old behaviour: the row is cut at the bottom of its page, with the development-mode warning.
