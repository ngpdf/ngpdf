---
'@ngpdf/core': minor
---

Borders now follow `border-radius`. `border-radius` takes one to four lengths in CSS corner order, and the `border-top-left-radius`, `border-top-right-radius`, `border-bottom-right-radius` and `border-bottom-left-radius` longhands set one corner each. Radii too big for their box are scaled down together, as in CSS, and a view split across pages keeps square corners where the page cuts it. An elliptical radius (`4 / 8`), a percentage or a negative radius throws. Before, `border-radius` took one length and rounded only the background, so square border lines stuck out of it.
