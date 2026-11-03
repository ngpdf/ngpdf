---
'@ngpdf/core': minor
---

New style property `min-presence-ahead`, to keep a section title from sitting alone at the bottom of a sheet. Set it to a length, for example `min-presence-ahead: 80pt`, and an element that would leave less than that much space below it on its sheet moves to the next one. The space is measured above the page number and fixed footers. An element already at the top of a sheet, the last one on a `pdf-page`, or one followed by a page break (`break-after: page` on it or `break-before: page` on the next element) stays where it is. It works on texts, images, views, tables and table rows (a value on a cell counts for its row); a header row ignores it. Elements joined to a moved element with `break-after: avoid` move with it. The default `0` changes nothing; a percentage, a keyword or a negative length throws.
