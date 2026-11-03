---
'@ngpdf/core': patch
---

A horizontal border line that crosses the bottom of the page in a unit taller than a page is now cut there. Before, its stroke could reach up to half its width below the content area, and a top border that started just above the cut was dropped.
