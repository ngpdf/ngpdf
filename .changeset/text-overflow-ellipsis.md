---
'@ngpdf/core': minor
---

`pdf-text` takes `text-overflow: clip | ellipsis`. With `ellipsis` and a fixed `height` or `max-height` on the same `pdf-text`, it keeps the lines that fit in its content box and ends the last one with `…`, cut the way `max-lines` cuts it. With `max-lines` too, the smaller number of lines wins. When not even one line fits, the first line is kept with its `…`. `clip` is the default and keeps the old behaviour. The property is not inherited, and an `overflow: hidden` parent's height does not count.
