---
'@ngpdf/core': minor
---

`opacity` now fades an element and everything inside it as one picture, as in CSS. Before, each piece inside a faded view was faded on its own, so overlapping children showed through each other and a background showed through the text and borders drawn over it. Now a faded card looks like the same card, solid, made see-through as a whole. Content that doesn't overlap looks the same as before. A faded view inside another faded view still composes (`0.5` inside `0.5` is `0.25` over the page), a color's own alpha still applies, and `opacity: 0` hides the content while its links keep working. Each faded element adds a small object to the PDF; fonts and images inside are not embedded twice.
