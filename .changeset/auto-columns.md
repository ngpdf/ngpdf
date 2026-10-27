---
'@ngpdf/core': minor
---

Add `'auto'` table columns: `[columns]="['auto', '1fr', 'auto']"` sizes a column to the widest
content of its cells on one line, so codes, dates and totals fit without wrapping. `auto` columns
come after fixed and percentage columns and before `fr` ones, and shrink in proportion when they do
not fit.
