---
'@ngpdf/core': minor
---

`pdf-link` links text or a box to a URL. `<pdf-link [href]="url">` is a column `pdf-view` where a view can go, and inline text like a `pdf-span` inside a `pdf-text`. Each piece is written as a borderless Link annotation: a block link is one clickable area per sheet, an inline link one per line fragment. Only absolute `http:`, `https:` and `mailto:` URLs are written, in their normalized form; any other scheme, a relative URL or one that does not parse writes no link, and the content is still drawn with a dev-mode warning. A link changes nothing visually. Areas are cut at the bottom of the page's content area but not by an `overflow` clip, and inside a `transform` an area is the bounding box of the transformed area. A `pdf-link` inside a `pdf-link` throws.
