---
'@ngpdf/core': patch
---

Rendering a PDF works in an app that hydrated from server-rendered HTML (`provideClientHydration()` with SSR or prerendering), where it threw `TypeError: rNode.getAttribute is not a function`. Angular looks for server-rendered DOM to reuse under every component it creates once hydration is on, and the PDF tree now tells it there is none.
