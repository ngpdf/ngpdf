---
'@ngpdf/core': minor
---

Adds hyphenation with the CSS `hyphens` property: `manual` (the default), `none` or `auto`. It is inherited, and a `pdf-span` can set it. A soft hyphen (`&shy;`) in your text now marks a place where a long word may break, with a hyphen drawn at the end of the line; before, soft hyphens were dropped and words never broke there. Where the line does not break, a soft hyphen still draws nothing. With `hyphens: auto`, words also break where your own hyphenation function allows: register it with `providePdfHyphenation`, for example on top of a pattern library you load lazily. ngpdf ships no hyphenation patterns.
