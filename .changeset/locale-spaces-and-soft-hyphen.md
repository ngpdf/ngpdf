---
'@ngpdf/core': patch
---

Text from the `date`, `currency` and `number` pipes no longer shows `?` where the locale uses a thin or narrow no-break space (`3:00 PM` in `en-US`, `1 234,50 €` in `fr`): the Unicode spaces U+2000–U+200A, U+202F and U+205F are drawn as a normal space, and the no-break ones (U+202F, U+2007) still keep `3:00 PM` on one line. A soft hyphen (U+00AD) is no longer drawn as a hyphen in the middle of a word, and a zero-width space (U+200B) is no longer drawn as `?`; both are removed.
