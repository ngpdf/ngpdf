---
'@ngpdf/core': patch
---

Style keywords are matched case-insensitively and trimmed, as in CSS. `text-align: CENTER` no longer
throws, and `font-weight: BOLD` and `font-style: ITALIC` are no longer dropped silently. This covers
`text-align`, `text-decoration`, `flex-direction`, `justify-content`, `align-items`, `align-self`,
`object-fit`, `font-weight`, `font-style` and `break-before`. Unknown keywords behave as before:
they throw for `text-align`, `text-decoration`, `flex-direction`, `justify-content`, `align-items`,
`align-self` and `object-fit`, fall back to `normal` for `font-weight` and `font-style`, and are
ignored for `break-before`.
