---
'@ngpdf/core': minor
---

Adds a `debug` input on `pdf-document` that draws layout outlines on every page, to find out why a box is not where you expect it. Each box gets a red outline around its border box, a blue dashed outline around its content box when it has padding or a border, and a small grey label with its tag and size in points. The page's content area gets a green dashed outline, and each line of a `pdf-text` a thin grey one. The outlines are drawn on top of everything, follow transforms and are not cut by `overflow: hidden`. Turning `debug` on never changes the layout or where pages break. Each render with it on prints the dev-mode warning `ngpdf: debug outlines are on`, so a debug PDF is not shipped by mistake.
