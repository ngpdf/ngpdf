---
'@ngpdf/core': patch
---

Rendering a PDF works in an app that hydrated from server-rendered HTML (`provideClientHydration()` with SSR or prerendering), where it threw `TypeError: rNode.getAttribute is not a function`.
