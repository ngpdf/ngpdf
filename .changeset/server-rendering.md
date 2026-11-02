---
'@ngpdf/core': minor
---

Adds server rendering. `renderToBuffer` from the new entry point `@ngpdf/core/server` renders a document to PDF bytes in Node, with no DOM: in a plain Node script, or in an Angular SSR route, where you can pass the app's `injector` so the document uses its services. It takes the same `inputs` as `renderToBlob`, plus `providers` such as `providePdfFonts`, and returns a `Uint8Array` you can send with `res.end()` or write to a file. Each call is isolated, so renders can run at the same time. `renderToBuffer` fetches nothing by itself: an `http:` or `https:` image or font URL is read only through the `fetchImage` function you pass, and refused without it. Restrict that function to your own hosts; a URL from user data then cannot make your server request internal addresses. Relative URLs and other schemes, such as `file:`, are refused on the server and never reach `fetchImage`. Data URLs and bytes work as before. On the server, `downloadPdf` and `pdfResource` given an `injector` now throw `ngpdf: … needs a browser` instead of failing later. In an SSR page, `pdf-viewer` shows its loading content and a `pdfResource` made in a component stays idle; the browser renders the PDF.

`pdf-image` now also takes a `Uint8Array` as `src`, so a Node `Buffer` from `readFile` works as it is.
