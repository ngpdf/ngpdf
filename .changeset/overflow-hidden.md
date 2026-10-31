---
'@ngpdf/core': minor
---

Support `overflow: hidden`. An element's children, text and image are clipped to its padding box, with rounded corners when it has `border-radius`, so a card can crop an `object-fit: cover` image or long text. Its own background and border are not clipped. `clip`, `scroll` and `auto` clip like `hidden`, and the layout does not change. A column `pdf-view` or a `pdf-text` that clips, with any of the four keywords, is one pagination unit and is never split across pages. One taller than a page is cut at the bottom of that page, and the rest of it is not drawn on the next one. `overflow` is ignored on `pdf-page` and `pdf-table`. Before, `overflow` was ignored everywhere.
