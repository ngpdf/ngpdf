---
'@ngpdf/core': minor
---

`display: none` now hides an element. It leaves the element and everything inside it out of the document: it takes no space, starts no new sheet and draws nothing, and the fixed views, absolute elements, notes, images and bookmarks inside it go with it. An anchor inside a hidden element does not exist, so a `pdf-link` to it gets the "names no anchor" warning in development mode and is drawn without a link. You can now write `[style.display]="shown() ? null : 'none'"` where you needed `@if`.

`display: flex` is the default and still accepted. Any other value, such as `block` or `grid`, now throws `ngpdf: invalid value "block" for display on pdf-view; use flex or none`. It used to be ignored without a warning.
