---
'@ngpdf/core': minor
---

Adds `ng add @ngpdf/core`. It installs the package and writes an example document, `src/app/documents/example-document.ts`, to your application. Add `--demo-route` to also get a `/pdf-demo` page with a Download PDF button and its route in `app.routes.ts`, `--project <name>` to choose the application, or `--path <folder>` to put the files elsewhere. It never overwrites a file, does not touch `main.ts` or your providers, and installs nothing besides `@ngpdf/core`. When it cannot find the `routes` array, it prints the route for you to add by hand.
