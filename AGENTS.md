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
`pdftotext` in Docker.

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
- **Bounded work.** Parsers are linear (no super-linear regex). Nesting deeper than 64 elements
  and a text node longer than 1 MB throw an `ngpdf:` error.

## Product rules

- **Selectors:** `pdf-document`, `pdf-page`, `pdf-view`, `pdf-text`, `pdf-span`, `pdf-image`,
  `pdf-table`, `pdf-row`, `pdf-cell`, `pdf-page-number`. The `pdf-` prefix is mandatory: `table`,
  `image` and `text` exist in HTML and SVG.
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
    yields its rows as units. A row `pdf-view` is one unit.
  - A unit is never split. A `pdf-text` that would be a unit is cut into line groups instead: the
    first `orphans` lines, each line between, and the last `widows` lines (2 and 2 by default).
    A short text, `break-inside: avoid`, a fixed `height` or a `max-height` keeps it one unit.
  - A `header` row repeats at the top of every page its table runs onto.
  - `breakBefore` starts a new page.
  - `pdf-page-number` as a direct child of `pdf-page` reserves its height at the bottom of the
    content area. Anywhere else it is a one-line leaf, measured with three-digit numbers and drawn
    with the numbers of the sheet it lands on.
  - A `pdf-view` with `fixed="top"` or `fixed="bottom"`, a direct child of `pdf-page`, is laid
    out once and drawn on every sheet; the flow gets the space between them. Bottom views sit
    above the page number.
  - A unit taller than a page goes on a page of its own, is clipped, and gets a dev-mode warning.
  - Wrapper backgrounds and borders are sliced per page.
- **Text wrapping:** text wraps at Unicode line-break opportunities. A word wider than its box breaks
  at the box edge.
- **Styled runs:** a `pdf-span` inside a `pdf-text` changes only `color`, `font-family`,
  `font-size`, `font-weight`, `font-style` and `text-decoration`. The paragraph breaks as one text,
  and runs of different sizes share a baseline. A `pdf-span` outside a `pdf-text` throws.
- **Images:**
  - Formats are PNG and JPEG, from a data URL, an http(s) URL, a `Blob` or an `ArrayBuffer`.
  - `object-fit` is `contain` (default) or `cover`.
  - A failed load rejects the render with `ngpdf: could not load image "<src>": <reason>`.
- **Out of v0.1:**
  - server rendering;
  - SVG, links, bookmarks;
  - hyphenation, justify, RTL;
  - forms, encryption;
  - a preview component;
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
- **Output safety:** never write PDF JavaScript, actions, forms or embedded files.
- **Commits:** Conventional Commits (`feat(core): …`, `fix(core): …`, `chore: …`), with no AI
  attribution or co-author lines.
- **Pull requests:** describe what changed and why, and how it was tested. The maintainer reviews
  the text before anything is pushed or published.
