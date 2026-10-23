---
title: How it works
description: The ngpdf pipeline from Angular renderer to node tree, styles, Yoga layout, pagination, display list and pdfkit, plus the lazy engine and bundle size.
section: Project
order: 12
---

ngpdf turns an Angular component into a PDF in a fixed pipeline. Each stage is plain TypeScript that takes the previous stage's output and returns new data, so each one is tested on its own.

## The pipeline

| Stage | Output | Where it runs |
| --- | --- | --- |
| Angular renders the document component through `PdfRendererFactory` | a `PdfNode` tree | eager: your main bundle |
| Dissolve component hosts | a tree of `pdf-*` elements only | lazy engine chunk |
| Resolve styles | a resolved style per element | lazy engine chunk |
| Load images | image bytes and sizes | lazy engine chunk |
| Lay out with Yoga | a box tree | lazy engine chunk |
| Paginate | pages | lazy engine chunk |
| Build the display list | draw operations per page | lazy engine chunk |
| Write with pdfkit | a `Blob` | lazy engine chunk |

### 1. Renderer factory and node tree

Angular renders every component through a `RendererFactory2`. For a render, ngpdf creates a child injector that provides its own renderer factory, and creates your component in it. Instead of DOM nodes, that renderer builds a small tree of plain objects: elements, text and comments. The `style` attribute and `[style.*]` bindings are recorded on each node. Classes, events and DOM properties are ignored, because a PDF has none of them.

Each `pdf-*` element is a standalone component with typed inputs. It registers itself on its node, and the engine reads its inputs from it. That is why you never need `NO_ERRORS_SCHEMA`.

ngpdf runs change detection once, then hands the tree to the engine.

### 2. Dissolving hosts

Elements that are not one of the nine `pdf-*` elements, such as your own components' hosts, are replaced by their children, like CSS `display: contents`. Every later stage sees only `pdf-*` elements, however you split the template into components.

### 3. Styles

The raw declarations are parsed into a resolved style per element: units converted to points, colors parsed, shorthands expanded, text styles inherited. Parsers run in linear time. Invalid values throw an `ngpdf:` error here.

### 4. Images

Every `pdf-image` source is loaded in parallel: data URLs are decoded, URLs fetched, `Blob`s read. Their pixel sizes are read from the PNG or JPEG headers. This is the only network I/O in a render.

### 5. Layout with Yoga

The tree is laid out with [Yoga](https://www.yogalayout.dev/), the flexbox engine also used by React Native, compiled to WebAssembly. Text is measured with the standard fonts' metrics and broken into lines at Unicode line-break opportunities, after characters outside WinAnsi are replaced with `?`. Table columns are resolved from the table's width, and cells are sized to them. Each page's content is laid out at its content width with unbounded height.

### 6. Pagination

The laid-out content is cut into sheets in whole units: rows, text blocks, images and row views. Header rows are repeated, `breakBefore` is honored, the page number's height is reserved, and the backgrounds and borders of wrappers are sliced per sheet. See [Pagination](/docs/pagination).

### 7. Display list

Each sheet becomes a flat list of four kinds of draw operations: rectangles, lines, text and images, with positions in points. Characters outside WinAnsi have already been replaced with `?` during layout; the page number's text is replaced here.

### 8. Writing with pdfkit

The draw operations are written with [pdfkit](https://pdfkit.org/), behind a small writer interface, with compressed streams. The result is a `Blob` of type `application/pdf`.

## The lazy engine

Everything after the node tree lives in a separate chunk that your bundler splits off. It is loaded with a dynamic `import()` on the first render, and kept for the following ones. If it fails to load, for example while offline, the next render tries again. Yoga's WebAssembly module is compiled once per page load.

The part of `@ngpdf/core` in your initial bundle is the elements, the renderer factory and the `PdfRenderer` service: no pdfkit, no Yoga, no style parsing. CI enforces a budget of 15 KB gzipped for it, and fails if pdfkit or Yoga reaches an initial chunk. CI measured 1,948 bytes gzipped on `main` in October 2026, about 2 KB.

## Determinism

The same component with the same inputs produces the same PDF bytes. The only time source is the document's `creationDate`, read once per render when you do not set it. Bind `[creationDate]` on `pdf-document` to a fixed date, and the output is reproducible, which the project's end-to-end tests rely on.

## Isolation

Each render has its own injector, node tree and PDF writer, and the document component is destroyed when the render settles. Nothing is shared between renders apart from the loaded engine code and the compiled Yoga module, so renders can run at the same time.

The source of each stage is in [`projects/core/src/lib`](https://github.com/ngpdf/ngpdf/tree/main/projects/core/src/lib) on GitHub.
