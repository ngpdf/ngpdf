---
'@ngpdf/core': minor
---

Support `position: relative` and `position: absolute` with `top`, `right`, `bottom` and `left`, as in CSS. A relative element is drawn moved by its offsets, and the layout around it does not change. An absolute element leaves the flow and is placed against the padding box of its nearest relative, absolute or transformed ancestor, or against the page's content area. With `left` and `right` both set and `width: auto` it stretches between them, and the same goes for the height. Positioned elements are drawn on top of the in-flow ones. An absolute element is never a pagination unit and is never split: it is drawn with its containing block when that is one unit, and otherwise on the sheet where its top lands. `position: fixed` and `sticky` throw; use the `fixed` input of `pdf-view` for a header or footer on every sheet. `position` and the offsets are ignored on `pdf-page`, `pdf-row` and `pdf-cell`. Before, all five properties were ignored.
