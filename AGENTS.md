# AGENTS.md

ngpdf renders Angular components to PDF. A document is a normal Angular component whose
template uses the `pdf-*` elements; a custom `RendererFactory2` turns it into a tree of nodes, and
a lazily loaded engine lays that tree out with Yoga, breaks it into pages and writes it with
pdfkit. Package `@ngpdf/core`, npm scope `@ngpdf`, GitHub `ngpdf/ngpdf`, MIT.

The structure and its patterns are in `docs/ARCHITECTURE.md`, tests, lint, CI, security and
releases are in `docs/ENGINEERING.md`, and what comes next is in `docs/roadmap-v0.2.md`. Working
design notes and implementation plans live in `docs/superpowers/`, which is gitignored and stays
on the maintainer's machine.
Read the ones your change touches before starting. A change that would
break a rule below needs a different approach or an explicit decision from the maintainer, not an
exception.

## Before writing any code

- **Load the Angular skills every time.** Load `angular-developer` before any task that touches
  Angular code: components, inputs, DI, injectors, pipes, change detection, tests, the CLI. Load
  `angular-new-app` before creating an app or a workspace.
- **Use the `angular-cli` MCP.**
  - Call `list_projects` to find the workspace.
  - Call `get_best_practices` with its path before writing Angular code.
  - Call `search_documentation` for any API whose Angular 22 form you are not sure of.
  - Do not write Angular APIs from memory when the MCP can confirm them.
- **Write the test first** and watch it fail. A test that passes without the change it covers
  guards nothing: revert the change and check that it fails.
- **Run the gate before saying a change is done:** `prettier --check .`, `eslint .`, the typecheck,
  `npm test -- --coverage` (coverage gates in `docs/ENGINEERING.md`), the bundle budget and, for
  anything that changes output, `scripts/e2e.mjs`.

## Commands

All toolchains run in Docker. Nothing is installed on the host except nvm.

```sh
./scripts/dev npm ci
./scripts/dev npm test                 # Vitest, all specs
./scripts/dev npm test -- <pattern>    # one area, e.g. paginate
./scripts/dev npm run build:core       # ng-packagr build of @ngpdf/core
./scripts/dev npx ng build demo
./scripts/dev node scripts/bundle-budget.mjs   # eager size of @ngpdf/core in the demo
node scripts/e2e.mjs [--update]        # demo PDFs in headless Chrome vs e2e/expected/*.txt
./scripts/dev npm run build:site       # ngpdf.dev, prerendered to dist/site/browser
```

The site (`projects/site`) is a prerendered Angular app. Its docs are the Markdown files in
`projects/site/src/content/docs/`; they must stay true to the library's code, like any other docs.
`.github/workflows/site.yml` deploys it to the Hostinger host over FTPS when `main` changes.

`scripts/dev` runs a command in `node:24-bookworm-slim` with the repo at `/w`, uid 1000 and a
6 GB memory cap. The end-to-end script uses the host's `/usr/bin/google-chrome` and runs
`pdftotext` in Docker. `NGPDF_APT=poppler-utils ./scripts/dev …` installs Debian packages as root
first, then runs the command as uid 1000; the server check needs it:

```sh
./scripts/dev npm run build:core
NGPDF_APT=poppler-utils ./scripts/dev node scripts/server-check.mjs   # packed dist/core in Node
```

- Never stop, kill or remove Docker containers you did not start. Name your own containers
  (`--name`) and stop only those.

## Architecture rules

- **Two halves, and the line between them is the bundle.**
  - The eager half is `projects/core/src/lib/tree`, `elements` and `render`. It has no pdfkit,
    no Yoga and no style parsing.
  - Everything in `projects/core/src/lib/engine` is reached only through a dynamic
    `import('../engine')` in `render/pdf-renderer.ts`.
  - Importing `@ngpdf/core` adds at most 15 KB gzipped to an app's initial bundle, and
    `scripts/bundle-budget.mjs` enforces it.
- **Only `engine/index.ts` imports `yoga-layout/load` and `createPdfkitWriter`.** pdfkit stays
  behind the `PdfWriter` interface in `engine/writer.ts`, so another writer could replace it.
- **The pipeline is fixed:** component → `PdfNode` tree → `ResolvedStyle` → `Box` tree (Yoga) →
  pages → `DrawOp[]` → `PdfWriter`. Each stage is plain TypeScript tested on its own output. Do not
  draw from layout code or lay out from writer code.
- **No React and no react-pdf code or packages.** The engine is the project's own.
- **Elements are components.** Each `pdf-*` element is a standalone component with typed inputs;
  it registers itself as its node's `owner`, and the engine reads `pdfProps()`. Users never need
  `NO_ERRORS_SCHEMA`.
- **Every render is isolated.** A render gets its own injector, tree and writer, and destroys the
  component in `finally`. Two renders at once must not share state.
- **Patterns in use, and why, are in `docs/ARCHITECTURE.md`:** pipes and filters with a
  functional core, an Adapter for Angular's renderer, an Adapter behind the `PdfWriter` port, and a
  Facade for `PdfRenderer`. Trees are plain data with recursive functions, and `DrawOp` is a
  discriminated union with exhaustive `switch`es. Do not add a pattern without a pressure that
  calls for it and an entry in that file.
- **Data between stages is readonly.** A stage returns new data and never mutates its input.
- **Bounded work.** Parsers are linear (no super-linear regex). Nesting deeper than 64 elements,
  a text node longer than 1 MB and a pdf-canvas with more than 100,000 calls or a non-finite
  number throw an `ngpdf:` error.

## Product rules

- **Selectors:** `pdf-document`, `pdf-page`, `pdf-view`, `pdf-text`, `pdf-span`, `pdf-link`,
  `pdf-note`, `pdf-image`, `pdf-canvas`, `pdf-table`, `pdf-row`, `pdf-cell`, `pdf-page-number`,
  and `pdf-viewer`, the preview component (an HTML component in the app, not a document
  element). The `pdf-` prefix is mandatory: `table`, `image` and `text` exist in HTML and SVG.
- **Preview:** `pdf-viewer` comes from its own entry point, `@ngpdf/core/viewer`, and never
  reaches an app that imports `@ngpdf/core` alone; `scripts/bundle-budget.mjs` checks it. It is
  built on `pdfResource` and shows the PDF in an `<iframe>` whose only trusted source is the
  `blob:` URL `pdfResource` makes. The iframe has no `sandbox`: Chrome blocks its PDF viewer in
  any sandboxed frame. It reaches `@ngpdf/core` by its package name only, never by a relative
  path.
- **Server rendering:** `renderToBuffer` comes from its own entry point, `@ngpdf/core/server`,
  and reaches `@ngpdf/core` by its package name only. It renders in Node with no DOM, through the
  same `renderTree` and engine as the browser, and returns a `Uint8Array`.
  - Without `injector`, each call builds a root injector of its own: root scope
    (`ɵINJECTOR_SCOPE`), zoneless change detection, the call's `providers`, and an empty object as
    `DOCUMENT`, which Angular reads once when it creates a component. With `injector`,
    `providers` go in a child of it. The injectors it creates are destroyed in `finally`.
  - On the server, an absolute image or font URL is read only through the app's `fetchImage`, and
    refused without it: `ngpdf: remote image "<url>" refused on the server; pass fetchImage`
    (`remote font` for fonts). A relative URL throws `ngpdf: relative image URL "<url>" on the
    server`. Data URLs and bytes always work.
  - `downloadPdf`, `PdfDownload`, `pdfResource` and `pdf-viewer` throw `ngpdf: <name> needs a
    browser; …` when there is no global `document` or the platform is `server`, before any render.
- **Units:**
  - a bare number and `pt` are points;
  - 1in = 72pt, 1cm = 72/2.54pt, 1mm = 72/25.4pt;
  - `px` = 1pt;
  - `%` is of the parent's content box;
  - any other unit throws.
- **Page sizes, in points:** A3 841.89×1190.55, A4 595.28×841.89, A5 419.53×595.28, Letter
  612×792, Legal 612×1008, or `[width, height]`. Landscape swaps them.
- **Fonts:**
  - The 12 text faces of the standard PDF fonts, WinAnsi encoding. In them, a character outside
    WinAnsi becomes `?`, with one dev-mode warning per render naming the characters.
  - Custom fonts (TTF, OTF, WOFF, WOFF2) come from `providePdfFonts` and are embedded as subsets.
  - `font-family` is a list: each grapheme cluster is drawn in the first font of the list that has
    it. A list with no registered family maps to one standard font, as it always has.
  - A character missing from every font in the list takes the first font's fallback: its empty
    glyph for a custom first font, `?` for a standard one. One dev-mode warning per render. No
    synthetic bold or italic.
  - Only the faces of families a document names are loaded, so an unused broken font never fails
    a render.
- **Tables:**
  - Columns are declared on the table: `[columns]` with points, `'Nfr'`, `'N%'` or `'auto'`.
  - Column widths are resolved in this order: fixed widths first, then percentages, then `auto`
    columns at their widest one-line cell content (shrunk in proportion if they overflow), then
    `fr` shares of what is left. Spanning cells don't size `auto` columns.
  - A `pdf-cell` takes its column's width by position, and `span` merges columns.
- **Pagination:**
  - Units are the children of a page, at any depth through column `pdf-view`s and tables. A table
    yields its rows as units. A row `pdf-view` is one unit, and so is a column `pdf-view` with a
    `transform` or an `overflow` other than `visible`.
  - A unit is never split, except a table row taller than a page (below). A `pdf-text` that
    would be a unit is cut into line groups instead: the first `orphans` lines, each line between,
    and the last `widows` lines (2 and 2 by default). A short text, `break-inside: avoid`, a fixed
    `height`, a `max-height`, a `transform` or an `overflow` other than `visible` keeps it one
    unit.
  - A `header` row repeats at the top of every page its table runs onto.
  - A body row of a table taller than a page (below its repeated header) splits instead of being
    clipped. It starts on the current sheet when one line of each non-empty cell fits there.
    Each cell breaks on its own, between the lines of its texts or the children of a column view
    in it, with no orphans or widows; content that can't break moves whole to the next piece, or
    is clipped when taller than a page. Each piece is as tall as its tallest cell piece, cells
    are drawn from the top and stretched to it, and cell and row decorations are sliced. A row
    with `break-inside: avoid`, a fixed `height`, a `max-height`, a `transform` or an `overflow`
    other than `visible`, a header row, and a row with nothing to break stay one unit.
  - `breakBefore` starts a new page, and `breakAfter` starts one after the element.
  - `break-after: avoid` (or `avoid-page`) moves an element to the next page with the unit after
    it when that unit does not fit. An element at the top of a page, a chain that would not fit on
    an empty page and the tail of a text carried from an earlier page are left alone.
  - `break-inside: avoid` on a column `pdf-view` or a `pdf-table` moves it whole to the next page
    when it fits on one; one taller than a page splits as usual.
  - `pdf-page-number` as a direct child of `pdf-page` reserves its height at the bottom of the
    content area. Anywhere else it is a one-line leaf, measured with three-digit numbers and drawn
    with the numbers of the sheet it lands on.
  - A `pdf-view` with `fixed="top"` or `fixed="bottom"`, a direct child of `pdf-page`, is laid
    out once and drawn on every sheet; the flow gets the space between them. Bottom views sit
    above the page number.
  - A unit taller than a page goes on a page of its own, is clipped, and gets a dev-mode warning.
    So does a piece of a split row that holds content taller than a page.
  - An element with `position: absolute` is never a unit, and never moves, splits or pushes one.
    It is placed against its nearest relative, absolute or transformed ancestor, or the page's
    content area. When that containing block is one unit, it is drawn with that unit. Otherwise it
    goes on the sheet where its own top lands, moved like the units around it, and one taller than
    what is left of the sheet is cut at the bottom. Inside a fixed view it repeats with the view.
  - `position: relative` offsets only move an element when it is drawn; pagination ignores them.
  - Wrapper backgrounds and borders are sliced per page; a gradient runs over the whole wrapper,
    so each sheet shows its part.
- **Text wrapping:** text wraps at Unicode line-break opportunities. A word wider than its box breaks
  at the box edge, unless it can be hyphenated. `max-lines` keeps at most N lines of a `pdf-text`;
  when text was cut, the last line ends with `…` in the face of its last run, or `...` in a font
  without `…`.
- **Hyphenation:** `hyphens` is `manual` (default), `none` or `auto`, inherited, and a `pdf-span`
  can set it.
  - A soft hyphen (U+00AD) is never drawn. Under `manual` and `auto` it is a break point.
  - `auto` also breaks where the app's function from `providePdfHyphenation` allows, called with
    the document's `language`. ngpdf bundles no patterns. Without the function, `auto` acts as
    `manual`, with one dev-mode warning per render.
  - Only words of 5 letters or more, keeping 2 letters on each side. A word with soft hyphens
    breaks only at them. The function is called at most once per word per render. Pieces that do
    not join back to the word, or a throw, mean that word is not hyphenated automatically, with
    one dev-mode warning; a word wider than its box still breaks at the box edge.
  - A word is hyphenated only when it does not fit on what is left of the line. The line ends
    with `‐` (U+2010) in the face of its last run, or `-` in a font without it (every standard
    font).
- **Styled runs:** a `pdf-span` inside a `pdf-text` changes only `color`, `font-family`,
  `font-size`, `font-weight`, `font-style`, `text-decoration`, `letter-spacing`,
  `text-transform` and `hyphens`. The paragraph breaks as one text, and runs of different sizes
  share a baseline. A `pdf-span` outside a `pdf-text` throws.
- **Links:** `<pdf-link [href]>` is a column `pdf-view` where a view can go and an inline run like
  a `pdf-span` inside a `pdf-text`. It changes nothing visually.
  - Only absolute `http:`, `https:` and `mailto:` URLs are written, normalized by `URL`. Any other
    href writes no link: the content is drawn, with a dev-mode warning naming the URL.
  - A block link is one rectangle per sheet (its border box, or its piece when split); an inline
    link is one per line fragment. Rectangles are cut at the content bottom but not by an
    `overflow` clip, and under a `transform` they are the axis-aligned bounds of the area.
  - A `pdf-link` inside a `pdf-link` throws `ngpdf: pdf-link inside a pdf-link`.
  - `href="#name"` jumps to the element with `anchor="name"`; a name no anchor has writes no link,
    with a dev-mode warning. Each anchor a link or bookmark uses is a named `/XYZ` destination
    at the top left of the element's first piece, and the link a GoTo action to it.
- **Anchors and bookmarks:** `pdf-view`, `pdf-text`, `pdf-image`, `pdf-table`, `pdf-row` and
  `pdf-cell` take `anchor` (a name) and `bookmark` (an outline title).
  - An anchor is the sheet where the element's first piece lands, at its top: a split text's
    first line group, a fixed view's first sheet. Names and titles are trimmed; an empty one is
    ignored. A second element with a name warns in dev mode (`ngpdf: duplicate anchor "<name>"`),
    and the first in tree order keeps it.
  - Bookmarks keep tree order and nest as their elements do, open. No entries, no outline. The
    outline panel opens only with `pageMode="UseOutlines"`.
- **Notes:** `<pdf-note>` is a Text annotation where a view can go, with `author`, `icon` and
  `open`. Text only, any character, no space in the layout, no action, never printed; under a
  `pdf-text` at any depth it throws, and properties other than `color`, `position` and the offsets
  are dropped with a warning. It is never
  a unit: it goes on the sheet of the content after it, or before it when it is the last child;
  an absolute note follows the absolute rules. Its color is its own, `#ffd400` by default.
  A page's notes are written before its links in `/Annots`, so a link is on top where they overlap.
- **Images:**
  - Formats are PNG and JPEG, from a data URL, an http(s) URL, a `Blob` or an `ArrayBuffer`.
  - `object-fit` is `contain` (default) or `cover`.
  - A failed load rejects the render with `ngpdf: could not load image "<src>": <reason>`.
- **Encryption:** `security` on `pdf-document` takes `userPassword`, `ownerPassword` and
  `permissions` (`printing: 'none' | 'low' | 'high'` and six booleans, all allowed by default).
  - The file is written with AES-256 (pdfkit's `pdfVersion: '1.7ext3'`, `/V 5 /R 5`) when a
    password is set or a permission is turned off; otherwise it is unencrypted.
  - Restricted permissions without an `ownerPassword` get a random 32-byte owner password.
  - A wrong type, an unknown field or value, or a password over 127 bytes in UTF-8 (also after
    NFKC) throws `ngpdf: invalid security <field>`. No error message contains a password.
- **Debug outlines:** `debug` on `pdf-document` outlines every box (border box, content box, a
  label with the tag and size), the page's content area and each text line, after everything
  else on the sheet. It never changes layout or pagination, and each render with it on gives one
  dev-mode warning, `ngpdf: debug outlines are on`.
- **Lines and shapes:** `<pdf-canvas [paint]="fn">` is a box with no content where a `pdf-view`
  can go, sized by `width`, `height` or flex (0 tall with a dev-mode warning otherwise).
  - `paint(ctx, size)` runs once per render, after layout, with the content box size; a canvas in
    a fixed view or a repeated header reuses its shapes on each sheet. Points are from the top
    left of the content box, and the drawing is clipped to it. A canvas is one unit.
  - A non-finite number, an unknown option or more than 100,000 calls on one canvas throws
    `ngpdf: pdf-canvas …`; an error thrown by `paint` rejects the render with
    `ngpdf: pdf-canvas paint failed: <message>`.
- **Out of v0.1:**
  - SVG;
  - RTL;
  - forms;
  - capturing the DOM.

  Do not add them without a design update.

## Code and repository rules

- **Angular 22:** standalone, zoneless-first (it must also work under zone.js), signals,
  `input()`/`output()`, `inject()`, and built-in control flow. Follow the `angular-developer`
  skill. Never set `standalone: true` or `ChangeDetectionStrategy.OnPush` explicitly.
- **Strict TypeScript.** Prefer `unknown` over `any`.
- **Files:** kebab-case file names, one concept per file, and specs next to the code (`*.spec.ts`).
- **Comments:** short and specific to the code, written as a person on the team would write them.
  No filler and no restating the line below.
- **Language:** code, comments, docs, commits and PRs are in English.
- **Naming:** docs say "for Angular". The project never presents itself as an official Angular
  project.
- **No company code or data.** Fixtures and the demo use made-up data.
- **Dependencies:** runtime dependencies stay at pdfkit, yoga-layout and linebreak. A new one
  needs a reason in the PR and must pass `npm audit` and OSV-Scanner. Vulnerabilities are fixed
  within the CVSS deadlines in `docs/ENGINEERING.md`.
- **Output safety:** never write PDF JavaScript, forms or embedded files, and no action other than
  the URI action of a `pdf-link` to an http, https or mailto URL, or its GoTo action to a named
  destination in the same file.
- **Commits:** Conventional Commits (`feat(core): …`, `fix(core): …`, `chore: …`), with no AI
  attribution or co-author lines.
- **Pull requests:** describe what changed and why, and how it was tested. The maintainer reviews
  the text before anything is pushed or published.
