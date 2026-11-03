---
'@ngpdf/core': patch
---

Absolute elements placed below the sheet that ends a page's content no longer get a sheet each. The first one starts a new sheet at its top, and the others land on that sheet, moved with it, until one's top falls below it and starts the next. Their tops are compared with a tolerance for Yoga's float32 positions, so two boxes one content height apart still land on two sheets. Two badges with the same `top` now share one sheet instead of making two.
