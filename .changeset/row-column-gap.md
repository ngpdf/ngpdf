---
'@ngpdf/core': minor
---

New `row-gap` and `column-gap` properties, and `gap` now takes two values, `gap: <row> <column>`. One value still sets both. Gaps take any length unit ngpdf accepts or a percentage of the container's content box (its height for `row-gap`, its width for `column-gap`); `gap: 10%` used to throw. A negative gap throws. On a `pdf-row` inside a table only the column gap is ignored, and the development-mode warning now names `pdf-row column-gap` instead of `pdf-row gap`; a `row-gap` there no longer warns.
