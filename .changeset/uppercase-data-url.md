---
'@ngpdf/core': patch
---

An image `src` written as an upper- or mixed-case data URL (`DATA:image/png;base64,...`) is now
decoded instead of being fetched over the network, as URL schemes are case-insensitive.
