---
'@ngpdf/core': patch
---

Text is measured once per render instead of again for every layout pass, so documents with a lot
of text lay out faster. The output is unchanged.
