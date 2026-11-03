---
'@ngpdf/core': minor
---

Rows can wrap. New `flex-wrap` (`nowrap`, `wrap`, `wrap-reverse`), the `flex-flow` shorthand (`<direction> <wrap>`, either part optional, the missing one reset to its default as in CSS) and `align-content` (`stretch` by default, `flex-start`, `center`, `flex-end`, `space-between`, `space-around`, `space-evenly`). These properties used to be ignored silently; a bad value now throws. Each line of a wrapping row is its own unit for pagination, so a long grid of cards or tags breaks between its lines and never through one, and the row gap before a line moved to a new page is dropped. `align-content` is not redone per page: lines keep their places from the single layout. A column with `flex-wrap` whose children went into several columns is kept whole. `flex-wrap` on a `pdf-row` inside a table is ignored, with the `ngpdf: ignored inside tables: pdf-row flex-wrap` development-mode warning.
