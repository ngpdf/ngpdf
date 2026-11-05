---
title: SVG
description: Draw logos, icons and charts from SVG markup, a data URL, a URL or a Blob with pdf-svg. They stay vector shapes in the PDF, with gradients, transforms and use.
section: Guide
order: 7.6
---

`pdf-svg` draws an SVG as vector shapes, so it stays sharp at any zoom. Its one input, `src`, is required. It goes anywhere a `pdf-image` can.

```ts
@Component({
  selector: 'app-letterhead',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page size="A4" style="padding: 36">
        <pdf-view style="flex-direction: row; gap: 12; align-items: center">
          <pdf-svg src="/assets/logo.svg" style="width: 48" />
          <pdf-text style="font-size: 16">Hillside Co-op</pdf-text>
        </pdf-view>
        <pdf-svg [src]="check" style="width: 16; color: #15803d" />
      </pdf-page>
    </pdf-document>
  `,
})
export class Letterhead {
  readonly check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg>';
}
```

## Sources

| `src` | How it is read |
| --- | --- |
| a string whose first non-space character is `<` | parsed as SVG markup |
| a string starting with `data:` | decoded in place, base64 or percent-encoded, as UTF-8 |
| any other string | downloaded with the browser's `fetch`, like an image |
| a `Blob` (or a `File`) | read with `blob.arrayBuffer()`, as UTF-8 |

A URL is read like a [`pdf-image`](/docs/images) URL. The render option `maxImageBytes` caps it, and on the server `renderToBuffer` reads it only through `fetchImage` (see [Server rendering](/docs/server-rendering)). Each distinct `src` is read and parsed once per render, however many elements use it.

The parser is ngpdf's own, not the browser's `DOMParser`, so a `pdf-svg` renders the same in a browser, a worker and Node.

## Size

Sizing works like `pdf-image`:

- Set `width` or `height` and the other side follows the SVG's natural size: the root's `width` and `height`, with a missing one taken from the `viewBox` ratio. When the root sets both, their ratio wins over a `viewBox` of another shape.
- Set neither and the SVG takes the root's `width` and `height` (`px` is 1pt, as everywhere in ngpdf), or its `viewBox` size. With none of them it is 300 × 150, the size a browser gives it.
- Set both, and `preserveAspectRatio` on the root places the drawing in the box: `xMidYMid meet` by default, any of the nine alignments, `meet` or `slice`, or `none` to stretch it.

A root without a `viewBox` behaves as if it had `0 0 width height`, so the drawing scales with the box, as an image does.

The drawing is clipped to the content box. A `pdf-svg` takes `padding`, borders, `background-color`, `opacity`, `transform` and margins like any box, and it is one [pagination](/docs/pagination) unit: it is never split across sheets. It also takes the `anchor` and `bookmark` inputs (see [Elements](/docs/elements)).

## What is drawn

- Elements: `svg` (nested too), `g`, `path`, `rect` (with `rx` and `ry`), `circle`, `ellipse`, `line`, `polyline`, `polygon`, `defs`, `linearGradient` and `radialGradient` with their `stop`s, and `use`.
- `path` takes the whole `d` grammar: every command, relative and absolute, implicit repeats and arcs. Path data with an error is drawn up to the error, as browsers do.
- Painting: `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`, `stroke-dashoffset`, `fill-rule`, `opacity`, `fill-opacity`, `stroke-opacity`, `transform` (`matrix`, `translate`, `scale`, `rotate`, `skewX` and `skewY`), `display="none"` and `visibility` (a hidden element paints nothing, but a child set back to `visible` does).
- These come as attributes or in an inline `style`, which wins over the attributes, and they are inherited the SVG way. `inherit` takes the parent's value.
- Colours take what the `color` style property takes, plus `currentColor`. At the root, `currentColor` is the `pdf-svg`'s own `color`, so one icon can be drawn in several colours.
- A gradient is used with `fill="url(#id)"` or `stroke="url(#id)"`, with an optional fallback colour after it. Gradients take `gradientUnits`, `gradientTransform`, a radial focal point (`fx`, `fy`, `fr`) and attributes and stops from other gradients through `href`, up to 16 gradients in a chain.
- `opacity` on an element draws it and what it holds as one picture, faded together, as `opacity` does on a `pdf-view`.
- Lengths take `px`, `pt`, `pc`, `in`, `cm`, `mm` and `%`, with ngpdf's units: `px` is 1pt.

## What is not drawn

`text`, `image`, `symbol`, `clipPath`, `mask`, `filter`, `pattern`, `marker`, `<style>` sheets, `foreignObject` and animation are left out, and the rest of the picture still draws. The `clip-path`, `mask`, `filter` and `marker` properties are left out the same way, and a `spreadMethod` other than `pad` is drawn as `pad`.

In development mode, each element or feature left out gets one warning per render that names it, such as `ngpdf: pdf-svg does not draw <text>`. An invalid value, such as an unknown colour or a negative `stroke-width`, is ignored with a warning, the way SVG ignores it, and the inherited value applies. `em` and `ex` lengths are not read.

Text in an SVG is not drawn. Convert it to paths in your editor (in Inkscape, Path > Object to Path), or put the text in a `pdf-text` next to the drawing, as the [demo](https://github.com/ngpdf/ngpdf/blob/main/projects/demo/src/app/documents/svg-sample.ts) does for its chart labels.

## Safety and limits

An SVG often comes from users or another server, so the parser bounds its work and never reaches out:

- It reads in one linear pass. It reads no DTD, and no entities besides the five of XML (`&lt;`, `&gt;`, `&amp;`, `&apos;`, `&quot;`) and numeric character references. A DTD, any other entity and processing instructions are skipped with a warning.
- Scripts and event attributes such as `onload` are skipped with a warning. Nothing in the file runs.
- An external reference, an `href` or `url()` that is not `#id`, is never fetched. It is skipped with a warning.
- Limits, each of which fails the render with an `ngpdf: pdf-svg …` error:
  - the source: 1 MB (1,048,576 bytes of UTF-8);
  - elements: 50,000;
  - nesting: 64 levels;
  - `use`: 16 levels deep, and at most 50,000 elements drawn in all. A `use` that points at itself or an ancestor stops at the depth limit, and billion-laughs style references stop at the element limit before anything is drawn.
  - what is drawn: a budget of 1,000,000 path segments, gradient stops, dash lengths and attribute bytes (an eighth of each), counting each copy a `use` draws, each shape a gradient paints and each dashed stroke. A file drawn once never gets near it.
- A URL is never read past 1 MB, whatever `maxImageBytes` allows, and a larger `Blob` is refused before it is read.

## Errors

| Error | Cause |
| --- | --- |
| `ngpdf: invalid SVG: <reason> at <offset>` | Malformed markup, such as an unclosed tag, or a root element that is not `svg`. The offset counts characters from the start of the source. |
| `ngpdf: could not load SVG "<src>": <reason>` | The source could not be read: a failed fetch, a size past `maxImageBytes`, or a `src` that is not a string or a `Blob`. |
| `ngpdf: pdf-svg source is larger than 1048576 bytes` | The source is over 1 MB. |
| `ngpdf: pdf-svg has more than 50000 elements` | Too many elements in the source. |
| `ngpdf: pdf-svg nesting deeper than 64` | Elements nested too deep. |
| `ngpdf: pdf-svg use nested deeper than 16` | A chain of `use` elements is too deep, or one points at itself. |
| `ngpdf: pdf-svg use expands to more than 50000 elements` | `use` elements draw too many elements in all. |
| `ngpdf: pdf-svg drawing is over its budget of 1000000 path segments, gradient stops, dashes and attributes` | The drawing is too large once `use` copies, gradients and dashes are counted. |
