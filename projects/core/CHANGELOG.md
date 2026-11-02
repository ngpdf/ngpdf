# @ngpdf/core

## 0.7.0

### Minor Changes

- [#149](https://github.com/ngpdf/ngpdf/pull/149) [`20d2466`](https://github.com/ngpdf/ngpdf/commit/20d2466447919401fcd1c8ab065afb09b95a74bc) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Support `position: relative` and `position: absolute` with `top`, `right`, `bottom` and `left`, as in CSS. A relative element is drawn moved by its offsets, and the layout around it does not change. An absolute element leaves the flow and is placed against the padding box of its nearest relative, absolute or transformed ancestor, or against the page's content area. With `left` and `right` both set and `width: auto` it stretches between them, and the same goes for the height. Positioned elements are drawn on top of the in-flow ones. An absolute element is never a pagination unit and is never split: it is drawn with its containing block when that is one unit, and otherwise on the sheet where its top lands. `position: fixed` and `sticky` throw; use the `fixed` input of `pdf-view` for a header or footer on every sheet. `position` and the offsets are ignored on `pdf-page`, `pdf-row` and `pdf-cell`. Before, all five properties were ignored.

- [#151](https://github.com/ngpdf/ngpdf/pull/151) [`0a14e4a`](https://github.com/ngpdf/ngpdf/commit/0a14e4acfbd29060c7db9794e5ce0658def64c44) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Adds links to places inside the document, and bookmarks. Give a `pdf-view`, `pdf-text`, `pdf-image`, `pdf-table`, `pdf-row` or `pdf-cell` an `anchor` name, and `<pdf-link href="#name">` jumps to it, for example from a table of contents. A `bookmark` title on the same elements adds an entry to the PDF's bookmarks panel, nested as the elements are nested in the template. `pageMode` now also takes `UseOutlines`, which opens that panel when the PDF opens. A link to a name that no element has, or a second element with the same name, draws the content as usual and warns in development mode.

- [#142](https://github.com/ngpdf/ngpdf/pull/142) [`254ecc9`](https://github.com/ngpdf/ngpdf/commit/254ecc97b642da3d6f5ad4c92d6604ebd93f7ede) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - `break-after: avoid` (or `avoid-page`) keeps an element on the same sheet as what follows it, so a heading no longer ends a sheet alone in most cases. When the next unit does not fit, the element moves to the next sheet with it. For a split text, only its first lines need to fit. Several elements in a row with `avoid` move together. An element already at the top of a sheet stays there, and a group that would not fit on an empty sheet is left where it is, so in those cases a heading can still end a sheet.

- [#156](https://github.com/ngpdf/ngpdf/pull/156) [`ea8bb74`](https://github.com/ngpdf/ngpdf/commit/ea8bb748f5bba30ad12f89d6660ef5b6a7166750) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Adds `pdf-canvas`, for charts, signature lines and other shapes. Put `<pdf-canvas [paint]="draw" style="height: 120" />` where a `pdf-view` can go, and draw in `draw(ctx, size)` with lines, curves, rectangles, circles, ellipses and polygons, filled or stroked, with dashes, line caps and joins, colors, opacity and transforms. Coordinates are in points from the top left of the canvas's content box, and the drawing is clipped to it. The function runs once per render, after layout, with the canvas's final size, and a canvas in a fixed header or a repeated table header is drawn on every sheet. A canvas is never split across pages. A non-finite number, an unknown option, too many calls, an error thrown by the function or a function that returns a promise rejects the render with an `ngpdf: pdf-canvas` error. The `PdfCanvasContext` and `PdfCanvasPaint` types are exported.

- [#157](https://github.com/ngpdf/ngpdf/pull/157) [`b44817d`](https://github.com/ngpdf/ngpdf/commit/b44817ddd4490e9ec1dbff1feb92a1400b8e4171) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Adds a `debug` input on `pdf-document` that draws layout outlines on every page, to find out why a box is not where you expect it. Each box gets a red outline around its border box, a blue dashed outline around its content box when it has padding or a border, and a small grey label with its tag and size in points. The page's content area gets a green dashed outline, and each line of a `pdf-text` a thin grey one. The outlines are drawn on top of everything, follow transforms and are not cut by `overflow: hidden`. Turning `debug` on never changes the layout or where pages break. Each render with it on prints the dev-mode warning `ngpdf: debug outlines are on`, so a debug PDF is not shipped by mistake.

- [#150](https://github.com/ngpdf/ngpdf/pull/150) [`44956d8`](https://github.com/ngpdf/ngpdf/commit/44956d86493a0bd348e4c89646a41ebf87f1d4c1) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Adds a `security` input on `pdf-document` to protect a PDF with a password and restrict what a viewer lets the reader do. `userPassword` is asked for when the file is opened, `ownerPassword` lifts the restrictions, and `permissions` limits printing to low resolution (`'low'`) or turns it off (`'none'`), and turns off copying, modifying, annotating, filling forms, content extraction for accessibility or page assembly. Everything is allowed unless you turn it off. The file is encrypted with AES-256, with no new dependency. Restricting permissions without an owner password uses a random one, so the restrictions cannot be lifted. Permissions are only a request to the viewer and do not protect the content; the user password does. A password written in your app's code is visible to every user, so pass one the user typed or your server sent. A password longer than 127 bytes in UTF-8, as typed or after Unicode NFKC normalization, or a value of the wrong type, throws `ngpdf: invalid security <field>`.

- [#146](https://github.com/ngpdf/ngpdf/pull/146) [`b9e379b`](https://github.com/ngpdf/ngpdf/commit/b9e379b97c12d6547965fb89c1cf742854c5dbcf) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Backgrounds can be gradients. `background-image` takes one `linear-gradient()` or `radial-gradient()`, and `background` becomes a shorthand for a color, a gradient, or both, with the color drawn under the gradient. Linear gradients take an angle (`deg`, `rad`, `turn`) or `to` a side or corner; radial ones take `circle` or `ellipse`, a size keyword and `at <position>`. Stops take any supported color and an optional position in `%` or a length, spread and ordered as in CSS. The gradient fills the border box, follows `border-radius`, and a view split across pages keeps one gradient for its whole height. `repeating-*` gradients, `conic-gradient()`, `url()` and several backgrounds throw an `ngpdf:` error.

- [#158](https://github.com/ngpdf/ngpdf/pull/158) [`e122b9e`](https://github.com/ngpdf/ngpdf/commit/e122b9e0318b65eb8ec47e2b66fa6161d4f10afb) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - `opacity` now fades an element and everything inside it as one picture, as in CSS. Before, each piece inside a faded view was faded on its own, so overlapping children showed through each other and a background showed through the text and borders drawn over it. Now a faded card looks like the same card, solid, made see-through as a whole. Content that doesn't overlap looks the same as before. A faded view inside another faded view still composes (`0.5` inside `0.5` is `0.25` over the page), a color's own alpha still applies, and `opacity: 0` hides the content while its links keep working. Each faded element adds a small object to the PDF; fonts and images inside are not embedded twice.

- [#153](https://github.com/ngpdf/ngpdf/pull/153) [`5ed8a06`](https://github.com/ngpdf/ngpdf/commit/5ed8a06088443670f968a112f25e740fa80941a2) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Adds hyphenation with the CSS `hyphens` property: `manual` (the default), `none` or `auto`. It is inherited, and a `pdf-span` can set it. A soft hyphen (`&shy;`) in your text now marks a place where a long word may break, with a hyphen drawn at the end of the line; before, soft hyphens were dropped and words never broke there. Where the line does not break, a soft hyphen still draws nothing. With `hyphens: auto`, words also break where your own hyphenation function allows: register it with `providePdfHyphenation`, for example on top of a pattern library you load lazily. ngpdf ships no hyphenation patterns.

- [#148](https://github.com/ngpdf/ngpdf/pull/148) [`bbf2e24`](https://github.com/ngpdf/ngpdf/commit/bbf2e24c4bced3e8ffe16586e7296d439f93e1ff) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Adds `pdf-link`, which makes text or a box open a URL when a reader clicks it in a PDF viewer. Put `<pdf-link [href]="url">` around a block, or use it inside a `pdf-text` for inline text. Only absolute `http:`, `https:` and `mailto:` URLs become links. Any other URL, a relative or invalid one, or a missing one draws the content without a link and warns in development mode. A link does not change how the content looks. A `pdf-link` inside another `pdf-link` throws an error.

- [#154](https://github.com/ngpdf/ngpdf/pull/154) [`5ee6aa9`](https://github.com/ngpdf/ngpdf/commit/5ee6aa98aba68ef7c4e15c55f20205d3b71a42e1) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Adds `pdf-note`, a comment on the page that PDF viewers show as an icon opening a popup, like a sticky note. Put it where a `pdf-view` can go, with the note's text as its content: `<pdf-note author="Ana" icon="help">Is this before tax?</pdf-note>`. `author` is shown as the note's title, `icon` picks one of the standard icons (`comment` by default, `note`, `help`, `key`, `insert`, `paragraph`, `new-paragraph`), and `open` shows the popup when the file opens. The icon is sticky-note yellow unless the note sets its own `color`. A note takes no space in the layout and is not printed. Its icon sits where the next element starts, or anywhere with `position: absolute`. A note in the flow lands on the same sheet as the content next to it; an absolute note follows the rules of `position: absolute`. The text can hold any character, also ones the page fonts can't draw. A note takes plain text only, and a note inside a `pdf-text` fails the render.

- [#143](https://github.com/ngpdf/ngpdf/pull/143) [`7c94088`](https://github.com/ngpdf/ngpdf/commit/7c940888fbcbb5d5a8f2b5393de1c3435bdf6e9f) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Support `overflow: hidden`. An element's children, text and image are clipped to its padding box, with rounded corners when it has `border-radius`, so a card can crop an `object-fit: cover` image or long text. Its own background and border are not clipped. `clip`, `scroll` and `auto` clip like `hidden`, and the layout does not change. A column `pdf-view` or a `pdf-text` that clips, with any of the four keywords, is one pagination unit and is never split across pages. One taller than a page is cut at the bottom of that page, and the rest of it is not drawn on the next one. `overflow` is ignored on `pdf-page` and `pdf-table`. Before, `overflow` was ignored everywhere.

- [#152](https://github.com/ngpdf/ngpdf/pull/152) [`e11393f`](https://github.com/ngpdf/ngpdf/commit/e11393f395adb778fc7e4fb8c849aba1a256b924) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Adds `pdf-viewer`, a live preview of a document, from the new entry point `@ngpdf/core/viewer`. `<pdf-viewer [document]="Invoice" [inputs]="{ invoice }" />` shows the PDF in the browser's own PDF viewer and renders it again, after a 300 ms pause by default, when `inputs` change. The previous PDF stays on screen while the next one renders. Content marked `pdfViewerLoading` shows until the first PDF is there, and content marked `pdfViewerError` shows when a render fails; `rendered` and `failed` emit the PDF and the error. Apps that don't import `@ngpdf/core/viewer` don't bundle it. Chrome on Android shows no PDF inside a page and Safari on iOS shows only the first page, so offer a download next to the preview. If your Content-Security-Policy sets `frame-src`, allow `blob:`.

  `pdfResource`'s `url()` now keeps the previous PDF's URL while a newer render runs, instead of going `undefined` until it finishes.

- [#159](https://github.com/ngpdf/ngpdf/pull/159) [`2dcf3e7`](https://github.com/ngpdf/ngpdf/commit/2dcf3e7a5ca16d61bec75581717e8b28024ae606) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - A table row taller than a page now splits across pages instead of being cut off at the bottom. Each cell breaks on its own, between the lines of its text or between the elements of a column `pdf-view` inside it, and the header row repeats above every piece. The cells of every piece are as tall as each other, so their borders line up, and backgrounds and borders are sliced with no border drawn at a cut. Content that can't break, such as an image, moves whole to the next page, or is cut at the bottom when it is taller than a page. A split row draws its cells from the top, so vertical alignment inside it is ignored. Rows that fit on a page are placed as before. `break-inside: avoid` on a row keeps the old behaviour: the row is cut at the bottom of its page, with the development-mode warning.

- [#145](https://github.com/ngpdf/ngpdf/pull/145) [`168e1fb`](https://github.com/ngpdf/ngpdf/commit/168e1fb2576ebce24277bd27c00685abdeeec386) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - `transform` and `transform-origin` are supported. `transform` takes `none` or a list of `rotate()`, `scale()`, `scaleX()`, `scaleY()`, `translate()`, `translateX()` and `translateY()`, applied left to right around `transform-origin` (`center` by default), as in CSS. Angles take `deg`, `rad` or `turn`, and translations take lengths or a percentage of the element's own border box. The whole element is transformed when drawn, background, border, children, text and image, and the layout does not change. A column `pdf-view` with a transform is one pagination unit, and a transformed `pdf-text` stays whole on one sheet. `transform` is ignored on `pdf-page` and `pdf-table`. `skew()`, `matrix()` and the 3D functions throw.

### Patch Changes

- [#244](https://github.com/ngpdf/ngpdf/pull/244) [`8c42ff3`](https://github.com/ngpdf/ngpdf/commit/8c42ff32cfe54bba8d4774baba70ac9451526626) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - `line-height: normal` is now matched in any case, like every other keyword: `NORMAL` or `Normal` keeps the inherited line height instead of failing the render.

## 0.6.0

### Minor Changes

- [#139](https://github.com/ngpdf/ngpdf/pull/139) [`376630b`](https://github.com/ngpdf/ngpdf/commit/376630b70104f64319398d56de44db4eef7095d7) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - `letter-spacing` and `text-transform` are supported and inherited like the other text styles, also on a `pdf-span`. `letter-spacing` adds space after each character and counts in wrapping, alignment and `max-lines`. `text-transform` takes `uppercase`, `lowercase` or `capitalize` and is applied before the text is measured.

- [#140](https://github.com/ngpdf/ngpdf/pull/140) [`4d6e05d`](https://github.com/ngpdf/ngpdf/commit/4d6e05d635d2936e3f61549ffb5a7fb6c6751aaf) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Borders now follow `border-radius`. `border-radius` takes one to four lengths in CSS corner order, and the `border-top-left-radius`, `border-top-right-radius`, `border-bottom-right-radius` and `border-bottom-left-radius` longhands set one corner each. Radii too big for their box are scaled down together, as in CSS, and a view split across pages keeps square corners where the page cuts it. An elliptical radius (`4 / 8`), a percentage or a negative radius throws. Before, `border-radius` took one length and rounded only the background, so square border lines stuck out of it.

## 0.5.0

### Minor Changes

- [#133](https://github.com/ngpdf/ngpdf/pull/133) [`76517d0`](https://github.com/ngpdf/ngpdf/commit/76517d087126751fea3bd49346c513270f4afaa3) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - `breakAfter` on `pdf-view` and `pdf-text`, and the style `break-after: page` on any element but a `pdf-span`, start a new sheet after that element. Like `breakBefore`, it applies to a whole row when set inside one, and it never adds a blank sheet at the end of a page.

  `break-inside: avoid` now works on a column `pdf-view` and a `pdf-table` too. One that doesn't fit in the space left on a sheet but fits on a whole sheet moves to the next sheet in one piece. One taller than a sheet splits as before.

### Patch Changes

- [#132](https://github.com/ngpdf/ngpdf/pull/132) [`0a5bad9`](https://github.com/ngpdf/ngpdf/commit/0a5bad956abe4b85087c6abc6a4268133db0b701) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Next line (U+0085) is now drawn as a normal space and collapses with the whitespace around it, like form feed, vertical tab and the line and paragraph separators. Before, a standard font drew it as `?`.

- [#134](https://github.com/ngpdf/ngpdf/pull/134) [`2d90fd2`](https://github.com/ngpdf/ngpdf/commit/2d90fd2b2539788bb634fe187f4d8535f1062de1) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - The style attribute is recognised in any case, as in HTML: `[attr.STYLE]` or a directive that sets `Style` now styles the element instead of being ignored.

- [#130](https://github.com/ngpdf/ngpdf/pull/130) [`08afbf5`](https://github.com/ngpdf/ngpdf/commit/08afbf539d2ece1af76bf21d315ac27693da1164) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - A `pdf-text` split over several pages no longer leaves a page in the middle with fewer lines than `orphans` and `widows` ask for when its lines have very different heights. A page gives lines back to the one before it, or the text starts on the next page, when that keeps the limits. When no layout keeps them, lines are placed one by one as before.

- [#129](https://github.com/ngpdf/ngpdf/pull/129) [`dc34713`](https://github.com/ngpdf/ngpdf/commit/dc34713776196215133a7d5fa56365eb1a9c1b76) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Vertical tab, form feed and the line and paragraph separators (U+2028, U+2029) are now drawn as a normal space, and U+FEFF is removed. A standard font draws the ideographic space (U+3000) and the Ogham space mark (U+1680) as a space too, while a custom font that has them still draws its own glyph. Before, a standard font drew all of these as `?` in the middle of a line, while the same characters at the ends of a paragraph were trimmed as whitespace.

## 0.4.0

### Minor Changes

- [#119](https://github.com/ngpdf/ngpdf/pull/119) [`9844b8c`](https://github.com/ngpdf/ngpdf/commit/9844b8c09f824a4872f67dd07d3162d227a65d09) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Add `'auto'` table columns: `[columns]="['auto', '1fr', 'auto']"` sizes a column to the widest
  content of its cells on one line, so codes, dates and totals fit without wrapping. `auto` columns
  come after fixed and percentage columns and before `fr` ones, and shrink in proportion when they do
  not fit.

- [#111](https://github.com/ngpdf/ngpdf/pull/111) [`b2ac328`](https://github.com/ngpdf/ngpdf/commit/b2ac3283566eaa8b30ce87af4b0a7e9b25ef2a82) Thanks [@Aaqibhafeezkhan](https://github.com/Aaqibhafeezkhan)! - Add optional document language, application attribution and initial page-view preferences to generated PDFs. Language tags and viewer preferences are validated, and the PDF producer metadata now identifies ngpdf instead of PDFKit.

- [#122](https://github.com/ngpdf/ngpdf/pull/122) [`59006e9`](https://github.com/ngpdf/ngpdf/commit/59006e912ed7cfbadfa0852061ee38a002d81517) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Add `max-lines` to cut a `pdf-text` to a number of lines. When text was cut, the last kept line ends with `…`, shortened until it fits the box, and the text is only as tall as the lines it keeps. A font without `…` gets `...` instead.

- [#117](https://github.com/ngpdf/ngpdf/pull/117) [`353ff5e`](https://github.com/ngpdf/ngpdf/commit/353ff5e317d1dce5a3c9c3ebc1dfa7e3e5a29b77) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - `pdf-page-number` now works anywhere in a page, not only as a direct child of `pdf-page`. Put it in
  a fixed header to show "Page 2 of 5" on every sheet, or anywhere in the content to show the number
  of the sheet it lands on. A direct child of `pdf-page` still reserves the bottom of every sheet as
  before.

- [#121](https://github.com/ngpdf/ngpdf/pull/121) [`6fb4354`](https://github.com/ngpdf/ngpdf/commit/6fb4354f6bf7dc5182598f4e4a0b185e5faf13ac) Thanks [@GabeSilvaDev](https://github.com/GabeSilvaDev)! - Add `text-align: justify`. Every line of a paragraph but the last is stretched to both edges of its
  box by widening the gaps between words, across `pdf-span`s and across a page break. The last line,
  a line with one word and a word wider than the box stay at the start.

### Patch Changes

- [#58](https://github.com/ngpdf/ngpdf/pull/58) [`ced90e0`](https://github.com/ngpdf/ngpdf/commit/ced90e026753732aa1254e61d12de6cf2c6945c8) Thanks [@arxigen](https://github.com/arxigen)! - Style keywords are matched case-insensitively and trimmed, as in CSS. `text-align: CENTER` no longer
  throws, and `font-weight: BOLD` and `font-style: ITALIC` are no longer dropped silently. This covers
  `text-align`, `text-decoration`, `flex-direction`, `justify-content`, `align-items`, `align-self`,
  `object-fit`, `font-weight`, `font-style` and `break-before`. Unknown keywords behave as before:
  they throw for `text-align`, `text-decoration`, `flex-direction`, `justify-content`, `align-items`,
  `align-self` and `object-fit`, fall back to `normal` for `font-weight` and `font-style`, and are
  ignored for `break-before`.

- [#63](https://github.com/ngpdf/ngpdf/pull/63) [`df2b007`](https://github.com/ngpdf/ngpdf/commit/df2b007064094fad1a5f6d3201474f9c917bea6e) Thanks [@arxigen](https://github.com/arxigen)! - ngpdf now uses pdfkit 0.20. pdfkit's ES module browser build replaces its old standalone bundle, so the combined PDF engine payload loaded on the first render drops from about 1.5 MB to about 610 KB before compression, and from about 433 KB to about 238 KB gzipped. The initial bundle is unchanged.

  The text and layout of the PDFs you get are unchanged. Their bytes are not: pdfkit 0.20 compresses streams with a different library and writes `/UserUnit 1` on every page.

  A JPEG's EXIF orientation is now read the way pdfkit 0.20 reads it: from the first Exif segment before the image data, even when an XMP segment or a comment comes first. The image's laid-out size keeps matching how pdfkit turns it.

  In an Angular CLI app, pdfkit no longer needs to be listed under `allowedCommonJsDependencies`. Angular may now name fontkit's CommonJS dependencies instead (`brotli`, `clone`, `dfa`, `fast-deep-equal` and `tiny-inflate`).

- [#60](https://github.com/ngpdf/ngpdf/pull/60) [`82788a8`](https://github.com/ngpdf/ngpdf/commit/82788a8ec46366baadd18ab80731f1ba0ab9d7c4) Thanks [@arxigen](https://github.com/arxigen)! - Large images given as percent-encoded data URLs load faster. The decoded image is unchanged.

- [#56](https://github.com/ngpdf/ngpdf/pull/56) [`af957f2`](https://github.com/ngpdf/ngpdf/commit/af957f25849b1b0f2e8b33edafba056c91d5cfbf) Thanks [@jay23606](https://github.com/jay23606)! - Support `thin`, `medium` and `thick` border widths, and reject negative border widths.

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
