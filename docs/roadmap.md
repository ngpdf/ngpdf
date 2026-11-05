# Roadmap

What ngpdf leaves for later. Each item was found during a build or a review and was deferred on
purpose: it is either documented as a limit (see "Limits" in the README) or does not affect a
correct document. Items that change behaviour need a design update first (`AGENTS.md`, "Out of
scope").

## Layout

- **Fill the remaining page height.** Pages lay out with an unbounded height, so a box cannot
  take "the rest of this page". The demo's capture report uses a fixed, computed image height
  instead (`projects/demo/src/app/documents/capture-report.ts`).
- **A clipped rounded border side** of a unit taller than a page can overshoot the cut by half its
  width; straight border lines stop at the cut.
- **A row-direction page** is one pagination unit whose box points at a copy of the page node.

## Text

- **Kerning across fonts.** With fallback along `font-family`, each font's run is kerned on its
  own; a pair that straddles two fonts is not.
- **Font collections** (`.ttc`) in `providePdfFonts`.
- More timing tests: the mid-word narrowing path under an inflating metric, and a 100,000-character
  unbreakable word at a narrow width.

## Images

- **Cancel sibling fetches** with an `AbortController` when one image fails.

## Tooling

- Spec hygiene: some component specs destroy in the test body instead of `finally`/`afterEach`,
  a global `URL` stub and the zone.js import leak into later tests, and a few assertions use loose
  `toMatchObject`.
- Triage the advisories `npm audit` reports in dev-only tooling, within the 30-day dev-dependency
  deadline in `docs/ENGINEERING.md`.
