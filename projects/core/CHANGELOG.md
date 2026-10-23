# @ngpdf/core

## 0.1.3

### Patch Changes

- [#34](https://github.com/ngpdf/ngpdf/pull/34) [`3da43bb`](https://github.com/ngpdf/ngpdf/commit/3da43bbc22ae8ad9e24a9f4c12a9c92f26314939) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - `break-before: page` on an element inside a table row or a row `pdf-view`, such as a `pdf-cell`, now starts a new page before that whole row. A `breakBefore` input on an inner `pdf-view` or `pdf-text` does the same. These breaks did nothing before.

- [#37](https://github.com/ngpdf/ngpdf/pull/37) [`0326e89`](https://github.com/ngpdf/ngpdf/commit/0326e892dff88173d7aef29edcdf60a1f43bd5f4) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - A JPEG with an EXIF orientation from 5 to 8, as portrait phone photos usually have, is now laid out at the size it is displayed at, with width and height swapped, so it keeps its aspect ratio instead of being squeezed into the box of the unrotated picture.

- [#35](https://github.com/ngpdf/ngpdf/pull/35) [`ef0e6ad`](https://github.com/ngpdf/ngpdf/commit/ef0e6ad63378cdf0afefa58948e127a9f96ecc79) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Text from the `date`, `currency` and `number` pipes no longer shows `?` where the locale uses a thin or narrow no-break space (`3:00 PM` in `en-US`, `1 234,50 €` in `fr`): the Unicode spaces U+2000–U+200A and U+205F are drawn as a normal space, and the no-break ones (U+2007, U+202F) as a no-break space, so `3:00 PM` stays on one line. A soft hyphen (U+00AD) is no longer drawn as a hyphen in the middle of a word, and a zero-width space (U+200B) is no longer drawn as `?`; both are removed.

- [#39](https://github.com/ngpdf/ngpdf/pull/39) [`a707598`](https://github.com/ngpdf/ngpdf/commit/a707598c9ceda85bea25f0c95218ad88e7428003) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - A document nested exactly 64 elements deep now renders when its innermost element holds text or an `@if`/`@for` block. The limit counted that text as one more level and rejected the document with `ngpdf: nesting deeper than 64`, which made the real limit 63 for almost every template.

- [#36](https://github.com/ngpdf/ngpdf/pull/36) [`11296e1`](https://github.com/ngpdf/ngpdf/commit/11296e17dbbe4b46497d8f399027135c3afdcbfb) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - A render that fails no longer leaves things behind. If the document component, or a component inside it, throws in its constructor, the services and callbacks of that render's injector are now cleaned up before the error reaches you; before, they stayed alive. Callbacks that a component registered with `inject(DestroyRef)` before the throw still do not run, because Angular does not hand back the partly created component. `download` and `downloadPdf` now remove their temporary link and free the PDF's memory even when the click throws.

- [#33](https://github.com/ngpdf/ngpdf/pull/33) [`cb6a54b`](https://github.com/ngpdf/ngpdf/commit/cb6a54bc197870eb73db6d1852312348515de04e) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - `padding: auto`, and `auto` on a `padding-*` side, now throw an `ngpdf:` error instead of becoming 0, since CSS has no `auto` padding. A negative `font-size` or padding now throws as well; negative margins still work, as in CSS. `gap` on a `pdf-row` inside a table is now named in the `ngpdf: ignored inside tables` dev-mode warning.

## 0.1.2

### Patch Changes

- [#10](https://github.com/ngpdf/ngpdf/pull/10) [`b30c004`](https://github.com/ngpdf/ngpdf/commit/b30c004713796a8d99bd525ce2e210b5479d70d6) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Rendering a PDF works in an app that hydrated from server-rendered HTML (`provideClientHydration()` with SSR or prerendering), where it threw `TypeError: rNode.getAttribute is not a function`.

## 0.1.1

### Patch Changes

- [#7](https://github.com/ngpdf/ngpdf/pull/7) [`3c457e9`](https://github.com/ngpdf/ngpdf/commit/3c457e981512b98d54640a84cf950d1c207a5565) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - `rgb()` and `rgba()` now throw an `ngpdf: invalid color` error on hexadecimal, binary or octal channel values such as `0x10`, `0b1` and `0o7`, which CSS does not accept. Documents with deeply nested component hosts now render without a stack overflow. Styles on the host of the document component you render do not affect the PDF: style its `pdf-document` or `pdf-page` instead.

## 0.1.0

### Minor Changes

- ba61563: First release. Write a PDF as an Angular component: a document is a normal component whose template uses the `pdf-document`, `pdf-page`, `pdf-view`, `pdf-text`, `pdf-image`, `pdf-table`, `pdf-row`, `pdf-cell` and `pdf-page-number` elements. A lazily loaded engine lays it out with Yoga, breaks it into pages and writes it with pdfkit, all in the browser. Importing `@ngpdf/core` adds at most 15 KB gzipped to the initial bundle.
