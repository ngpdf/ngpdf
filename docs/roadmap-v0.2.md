# Roadmap: v0.2

What v0.1 leaves for later. Each item was found during the v0.1 build or its reviews and was
deferred on purpose: v0.1 either documents it as a limit (see "v0.1 limits" in the README) or
it does not affect a correct document. Items that change behaviour need a design update first
(`AGENTS.md`, "Out of v0.1").

## Layout

- **Fill the remaining page height.** Pages lay out with an unbounded height, so a box cannot
  take "the rest of this page". The demo's capture report uses a fixed, computed image height
  instead (`projects/demo/src/app/documents/capture-report.ts`).
- **Group opacity.** `opacity` multiplies down the tree, so overlapping children of a faded view
  show through each other. True group compositing needs a transparency group (a PDF form
  XObject) per faded box.
- **Half-leading.** Text sits at the top of its line box; CSS splits the extra line height above
  and below the text.
- **Rounded borders.** `border-radius` together with borders draws square border lines whose
  corners poke out of the rounded background.
- **A clipped border line** of a unit taller than a page can overshoot the cut by half its width.
- **Table headers:**
  - a header row is dropped, without a warning, on a page whose first row fits only without it;
  - several header rows that together exceed the page are not repeated, without a warning;
  - header rows lose their `breakBefore`.
- **A row-direction page** is one pagination unit whose box points at a copy of the page node.

## Text

- **Kerning across fonts.** With fallback along `font-family`, each font's run is kerned on its
  own; a pair that straddles two fonts is not.
- **Font collections** (`.ttc`) in `providePdfFonts`.
- More timing tests: the mid-word narrowing path under an inflating metric, and a 100,000-character
  unbreakable word at a narrow width.

## Images

- **A size cap on fetched images.** An image URL is downloaded in full, however large.
- **Cancel sibling fetches** with an `AbortController` when one image fails.

## Robustness

- **Unknown keywords.** Keywords are matched case-insensitively, but an unknown one throws for
  `text-align` and the other `oneOf` properties, falls back to `normal` for `font-weight` and
  `font-style`, and is ignored by `break-before` and `break-inside`; pick one policy (fallback or
  throw).
- Missing renderer edge tests: `--custom` properties, `!important`, `insertBefore` with a
  reference node that is not a child, `removeChild` with the wrong parent, `setAttribute('style')`
  after `setStyle`.
- `PdfRendererFactory.createRenderer()` has a narrower signature than `RendererFactory2`'s.
- The nesting limit counts anonymous text boxes; document or exclude them.

## Tooling

- **The bundle budget measures the demo build of the source**, splitting chunks by folder. Measure
  the built package in `dist/core` instead, and grep its `fesm2022` files for a static import of
  the engine, pdfkit or Yoga.
- **Poppler version detection.** The e2e script's Docker fallback hard-codes poppler's major
  version, and hides `apt-get` errors.
- **The e2e Chrome can leak** when `puppeteer.launch` finishes after the script's timeout.
- Spec hygiene: some component specs destroy in the test body instead of `finally`/`afterEach`,
  a global `URL` stub and the zone.js import leak into later tests, and a few assertions use loose
  `toMatchObject`.
- Triage the advisories `npm audit` reports in dev-only tooling, within the 30-day dev-dependency
  deadline in `docs/ENGINEERING.md`.
