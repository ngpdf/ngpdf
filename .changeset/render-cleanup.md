---
'@ngpdf/core': patch
---

A render that fails no longer leaves things behind. If the document component, or a component inside it, throws in its constructor, the services and callbacks of that render's injector are now cleaned up before the error reaches you; before, they stayed alive. Callbacks that a component registered with `inject(DestroyRef)` before the throw still do not run, because Angular does not hand back the partly created component. `download` and `downloadPdf` now remove their temporary link and free the PDF's memory even when the click throws.
