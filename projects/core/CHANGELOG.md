# @ngpdf/core

## 0.1.2

### Patch Changes

- [#10](https://github.com/ngpdf/ngpdf/pull/10) [`b30c004`](https://github.com/ngpdf/ngpdf/commit/b30c004713796a8d99bd525ce2e210b5479d70d6) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Rendering a PDF works in an app that hydrated from server-rendered HTML (`provideClientHydration()` with SSR or prerendering), where it threw `TypeError: rNode.getAttribute is not a function`.

## 0.1.1

### Patch Changes

- [#7](https://github.com/ngpdf/ngpdf/pull/7) [`3c457e9`](https://github.com/ngpdf/ngpdf/commit/3c457e981512b98d54640a84cf950d1c207a5565) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - `rgb()` and `rgba()` now throw an `ngpdf: invalid color` error on hexadecimal, binary or octal channel values such as `0x10`, `0b1` and `0o7`, which CSS does not accept. Documents with deeply nested component hosts now render without a stack overflow. Styles on the host of the document component you render do not affect the PDF: style its `pdf-document` or `pdf-page` instead.

## 0.1.0

### Minor Changes

- ba61563: First release. Write a PDF as an Angular component: a document is a normal component whose template uses the `pdf-document`, `pdf-page`, `pdf-view`, `pdf-text`, `pdf-image`, `pdf-table`, `pdf-row`, `pdf-cell` and `pdf-page-number` elements. A lazily loaded engine lays it out with Yoga, breaks it into pages and writes it with pdfkit, all in the browser. Importing `@ngpdf/core` adds at most 15 KB gzipped to the initial bundle.
