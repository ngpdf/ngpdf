---
'@ngpdf/core': patch
---

When the constructor of the document component, or of a component inside it, throws during a render, the render's injector is now destroyed and its own `DestroyRef` callbacks run; before, it was left alive. `inject(DestroyRef)` callbacks that components registered before the throw still do not run, because Angular does not hand back the partly created component. `download` and `downloadPdf` now remove their temporary `<a download>` and revoke the object URL even when the click throws.
