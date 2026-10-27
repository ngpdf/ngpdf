# @ngpdf/core

## 0.3.0

### Minor Changes

- [#116](https://github.com/ngpdf/ngpdf/pull/116) [`1c7adcf`](https://github.com/ngpdf/ngpdf/commit/1c7adcfc5bda7c96915375ff8429774a0ee8783f) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Add fixed headers and footers: a `pdf-view` with `fixed="top"` or `fixed="bottom"`, placed directly
  inside a `pdf-page`, is drawn on every sheet of that page, and the content flows in the space
  between them. A footer sits above the `pdf-page-number`.

- [#112](https://github.com/ngpdf/ngpdf/pull/112) [`2e89379`](https://github.com/ngpdf/ngpdf/commit/2e893798fbd7e0c2b4e7c43a8f79df2c07ebe356) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Add the `pdf-span` element to style part of a text, such as one bold word in a sentence:
  `<pdf-text>Total: <pdf-span style="font-weight: bold">{{ total }}</pdf-span></pdf-text>`. A span
  can change the color, font family, size, weight, style and decoration; the paragraph still wraps as
  one text, and runs of different sizes share a baseline. Characters drawn in a fallback font now
  share the baseline of the text around them instead of its top.

- [#114](https://github.com/ngpdf/ngpdf/pull/114) [`646d783`](https://github.com/ngpdf/ngpdf/commit/646d783589883f8e99860bf1783231f452ca8de1) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - A long `pdf-text` now breaks between its lines at a page break instead of moving to the next page
  whole, or being clipped when taller than a page. `orphans` and `widows` (default 2) set the fewest
  lines kept before and after the break. A text keeps the old behaviour, moving whole, when it has
  `break-inside: avoid`, a fixed `height` or a `max-height`, or when it sits inside a table row or a
  row `pdf-view`.

## 0.2.0

### Minor Changes

- [#110](https://github.com/ngpdf/ngpdf/pull/110) [`b2762ed`](https://github.com/ngpdf/ngpdf/commit/b2762ed5acfa54114d6f31b236a994b68a2de3ad) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Add custom fonts: register TTF, OTF, WOFF or WOFF2 files with `providePdfFonts` and name them in
  `font-family`. Text in them is not limited to WinAnsi, and each character falls back along the
  `font-family` list to the first font that has it. Only the fonts a PDF uses are embedded, as
  subsets. Documents that name no registered family render exactly as before.

- [#108](https://github.com/ngpdf/ngpdf/pull/108) [`318a305`](https://github.com/ngpdf/ngpdf/commit/318a3054f9c8ef54ff744d42f4c4752df27e1e2c) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Add the `pdfDownload` directive: `<button [pdfDownload]="Invoice" pdfFileName="invoice.pdf">`
  downloads the document when clicked, marks the button busy and ignores clicks while it renders,
  and reports a failed render through `(pdfError)` and the app's `ErrorHandler`.

- [#107](https://github.com/ngpdf/ngpdf/pull/107) [`1c4d22a`](https://github.com/ngpdf/ngpdf/commit/1c4d22a5d6536b30c46a14ae22c7a301e142b5e4) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Add `pdfResource` to keep a PDF Blob and object URL current as document inputs change. It also
  exposes loading and error state, revokes replaced URLs, and can debounce bursts of changes.

### Patch Changes

- [#59](https://github.com/ngpdf/ngpdf/pull/59) [`17706f7`](https://github.com/ngpdf/ngpdf/commit/17706f773f7817fc755a2a2500b61bac1dd4520f) Thanks [@arxigen](https://github.com/arxigen)! - A `pdf-image` with element children now rejects the render with
  `ngpdf: pdf-image cannot have children (found <pdf-text>)`, naming the first child, before any
  image is fetched. The error identifies the element you need to remove.

- [#64](https://github.com/ngpdf/ngpdf/pull/64) [`7ac8749`](https://github.com/ngpdf/ngpdf/commit/7ac8749d91a252697e64a27b85a240ce5145bdbf) Thanks [@arxigen](https://github.com/arxigen)! - A `;` inside quotes or parentheses in a `style` attribute no longer ends the declaration, so values
  such as `url(data:image/png;base64,...)` or `font-family: "A;B"` are kept whole.

- [#71](https://github.com/ngpdf/ngpdf/pull/71) [`f6cbe03`](https://github.com/ngpdf/ngpdf/commit/f6cbe03a8f70e308c4a7f1f64585e96fd7ca2da3) Thanks [@arxigen](https://github.com/arxigen)! - Text is measured once per render instead of again for every layout pass, so documents with a lot
  of text lay out faster. The output is unchanged.

- [#55](https://github.com/ngpdf/ngpdf/pull/55) [`fc028e9`](https://github.com/ngpdf/ngpdf/commit/fc028e9b27dffaeca97f9113ff4d1785075fd1ff) Thanks [@arxigen](https://github.com/arxigen)! - An image `src` written as an upper- or mixed-case data URL (`DATA:image/png;base64,...`) is now
  decoded instead of being fetched over the network, as URL schemes are case-insensitive.

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
