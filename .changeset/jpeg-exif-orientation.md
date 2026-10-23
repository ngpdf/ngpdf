---
'@ngpdf/core': patch
---

A JPEG with an EXIF orientation from 5 to 8, as portrait phone photos usually have, is now laid out at the size it is displayed at, with width and height swapped, so it keeps its aspect ratio instead of being squeezed into the box of the unrotated picture.
