# Architecture

How ngpdf is built, and why. The product rules and the v0.1 scope are in `AGENTS.md`. This file
covers the structure and the patterns. Each pattern below is used because a concrete pressure in
this project calls for it. Where the simplest correct answer is no pattern, this file says so.

## The shape: a pipeline over immutable data

```
 document component (Angular)
        │  PdfRendererFactory            eager half: tree/, elements/, render/
        ▼
 PdfNode tree ── owner.pdfProps(), rawStyle
        │  ─ ─ ─ ─ ─ ─ dynamic import('../engine') ─ ─ ─ ─ ─ ─
        ▼                                 lazy half: engine/
 dissolveHosts      → PdfNode tree of pdf-* elements only
 resolveStyles      → Map<PdfNode, ResolvedStyle>
 collectAnchors     → anchor names, marked elements, outline
 loadImages         → Map<PdfNode, ImageAsset>          (the only async I/O)
 layoutBox (Yoga)   → Box tree
 paginatePage       → PageLayout[]
 displayList        → DrawOp[][]
 PdfWriter.write    → Blob
```

**Architecture pattern: pipes and filters, with a functional core and an imperative shell.**

- Each stage is a function from the previous stage's output to a new value.
- A stage does not mutate its input, keeps no state between calls, and does no I/O.
- The I/O sits at the edges, in the imperative shell:
  - Angular's change detection at the start;
  - fetching images;
  - pdfkit writing bytes at the end.

**Why this fits:**

- **Testing.** Each stage's input and output is plain data. A failing PDF is narrowed down by
  asserting on boxes or draw operations, never on PDF bytes.
- **Isolation.** Two renders at once share nothing. Concurrency comes for free instead of being
  handled with locks.
- **The bundle line.** It falls between the tree and the engine, and the pipeline crosses it in
  exactly one place.
- **Server rendering in v0.2.** It reuses every engine stage unchanged.

**Alternative rejected: a retained, mutable layout tree updated in place, as ng-native's engine
does.** That design pays off when a tree is re-laid out many times, as a UI is on every commit. A
PDF is laid out once per render, so the incremental bookkeeping, the dirty flags and the cache
invalidation would buy nothing here.

**Dependency direction:**

- `render` depends on `tree` and `elements`.
- `engine` depends on `tree` types only.
- Nothing in `tree` or `elements` imports `engine`.
- Inside `engine`, a stage imports only the stages before it, and `index.ts` wires them.
- An ESLint boundary rule enforces all of this (see `docs/ENGINEERING.md`).

## Pattern decisions

### Adapter: `PdfRendererFactory` (Angular → PdfNode)

- **Context.** Angular renders through `RendererFactory2`/`Renderer2`, an interface built for the
  DOM. The engine needs a plain tree.
- **Decision.** Adapter. `PdfRendererFactory` implements Angular's interface and translates each
  call into a `PdfNode` operation.
  - `setStyle` becomes `rawStyle`.
  - Events and classes are ignored, because a PDF has neither.
- **Alternative.** A separate Angular platform (`platformNative`, as ng-native has). It loses
  because the spike showed that a child `EnvironmentInjector` is enough to render inside the
  user's own browser app. Their services, locale and pipes come with it, and no second platform
  needs bootstrapping.
- **Test.** The renderer spec drives the adapter with Angular's renderer calls and asserts on the
  tree. The render-tree spec proves a real template produces the expected tree.

### Adapter behind a port: `PdfWriter` (DrawOp → pdfkit)

- **Context.** pdfkit has a large, stateful, chainable API: fonts, the current point, graphics
  state. The engine should know only draw operations.
- **Decision.**
  - `PdfWriter` is a port, an interface owned by the engine.
  - `createPdfkitWriter` is the Adapter behind it. It translates each `DrawOp` into pdfkit calls
    and wraps pdfkit's font metrics as `FontMetrics`.
  - Custom fonts go through the same port: the engine registers each face's bytes as
    `font:<index>` with `registerFont`, asks `hasGlyph` which font of a `font-family` list draws
    each character, and draws each run of a line as its own text op.
- **Why an interface with one production implementation is justified.** It already has a second
  implementation: the recording fake used by the engine tests. And jsPDF is the documented
  fallback writer should pdfkit's browser build become a problem.
- **Alternative.** Calling pdfkit directly from the display list. It loses because every layout
  test would then need to parse PDF output, and the writer could never be swapped.
- **Removal trigger.** None expected.

### Facade: `PdfRenderer` service

- **Context.** One render choreographs eight steps:
  1. create the injector;
  2. create the component;
  3. set the inputs;
  4. run change detection;
  5. load the engine;
  6. render;
  7. destroy in `finally`;
  8. download.

  Every caller would otherwise repeat them, and get the cleanup wrong.
- **Decision.** Facade. `PdfRenderer.toBlob` and `.download` are the entry points.
  `renderToBlob`/`downloadPdf` are the same facade for code outside an injection context.
- **Not a Singleton.** It is `providedIn: 'root'` for DI lifetime only. It holds no mutable state;
  each call builds its own pipeline.

### Lazy loading: a memoised `import()`, no Proxy

- **Context.** The engine must not be in the initial bundle.
- **Decision: no pattern.**

  ```ts
  let engine: Promise<typeof import('../engine')> | undefined;
  const loadEngine = () => (engine ??= import('../engine'));
  ```

  The module system already provides the lazy, cached subject. A virtual Proxy would wrap the same
  thing in a class.
- **Failure case.** If the chunk fails to load (offline), the promise is cleared and the next
  render tries again.

### Component hosts: dissolved once, before the stages

- **Context.** A document is split into components like any Angular template, so a
  `pdf-page`, `pdf-row` or `pdf-cell` often sits inside a user component's host element. Every
  stage that collects children (pages, rows, cells, pagination units, layout) would otherwise
  have to look through hosts.
- **Decision.** `dissolveHosts` copies the document's tree with every element that is not one of
  the twelve `pdf-*` elements replaced by its children, like CSS `display: contents`. A host's
  own style is ignored, with one dev-mode warning per tag. The stages after it never see a host.
- **Alternative.** Teaching each stage to skip hosts. It loses because five places would each
  need the same rule, and missing one gives a silent wrong layout.

### Trees: plain data with explicit traversal, no Composite classes

- **Context.** `PdfNode` and `Box` are trees, and every stage walks them.
- **Decision.** Plain interfaces and recursive functions: `resolveStyles(root)`, `layoutBox(node)`,
  `units(node)`. There is no `Component` base class with `add`/`remove`/`draw` overrides.
- **Why not Composite.** Leaves and containers share few operations: a `pdf-text` measures text,
  a `pdf-table` resolves columns, a `pdf-image` loads bytes. Uniform methods would put invalid
  operations on leaves. Behaviour per element type also lives better in the stage that needs it
  than spread across element classes.

### `DrawOp` handling: a discriminated union and an exhaustive `switch`, no Visitor

- **Context.** The writer and the tests act on fourteen draw operation kinds: `rect`, `line`,
  `path`, `text`, `image`, `transform` with its closing `untransform`, `clip` with its closing
  `unclip`, `group` with its closing `ungroup`, `link`, `anchor` and `note`.
- **Decision.** `DrawOp` is a TypeScript discriminated union. Code that handles it uses a
  `switch (op.op)` with an `assertNever` default, so adding a kind fails to compile wherever it is
  not handled.
- **Why not Visitor.** TypeScript's exhaustive pattern matching gives the same safety without
  double dispatch, and the set of operations is small.

### Lookup tables and small conditionals, no Strategy

The following are stable data or stable algorithms with no credible second variant, so they stay
direct code. Strategy would add indirection with one implementation each.

- **Lookup tables (`Map` or `Object.hasOwn`, never a plain-object index):** page sizes, unit
  factors, standard font names, CSS named colors.
- **One algorithm each:** column width resolution, `object-fit`, and image source kinds (a
  four-case `switch` over the source type).

## Cross-cutting rules

- **Data between stages is readonly.** Use `readonly` fields and `ReadonlyMap` in the types. A
  stage returns new data.
- **No module-level mutable state in the engine**, apart from the memoised Yoga loader. Every
  render is isolated.
- **Errors.**
  - Invalid input in a template, such as an unknown unit or an image that fails to load, throws an
    `Error` whose message starts `ngpdf:` and names the element and the value.
  - What can be drawn anyway, such as a character outside WinAnsi or a unit taller than a page,
    is drawn, and gets one dev-mode warning per render.
- **Limits against hostile or broken data.** The data in a document often comes from users or a
  server, so the engine bounds its own work:
  - parsers are linear: no regex with nested quantifiers or overlapping alternatives;
  - nesting deeper than 64 elements throws `ngpdf: nesting deeper than 64`;
  - a text node longer than 1 MB throws.

  These limits come from the ReDoS and stack-overflow bugs found in ng-native's style engine in
  October 2026.
- **Determinism.** The same input gives the same PDF bytes. `creationDate` is the only time
  source, and it can be passed in. The end-to-end golden files rely on this.

## Repository layout

```
projects/core/src/lib/tree/       PdfNode, PdfRendererFactory           (eager)
projects/core/src/lib/elements/   pdf-* components, PDF_ELEMENTS        (eager)
projects/core/src/lib/render/     render-tree, PdfRenderer facade       (eager)
projects/core/src/lib/engine/     hosts, color, style, anchors, fonts, text, images, layout,
                                  paginate, display-list, writer, index (lazy)
projects/core/viewer/             pdf-viewer, entry point @ngpdf/core/viewer (own chunk)
projects/demo/                    the three reference documents
projects/site/                    ngpdf.dev: landing, docs (Markdown), examples
scripts/                          dev (Docker), e2e, bundle budget
docs/                             this file, ENGINEERING.md, roadmap
```
