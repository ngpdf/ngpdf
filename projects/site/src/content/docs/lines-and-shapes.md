---
title: Lines and shapes
description: Draw charts, signature lines and other shapes with pdf-canvas, a box whose paint function draws paths with fills, strokes, dashes and transforms.
section: Guide
order: 7.5
---

`pdf-canvas` is a box that you draw in with a function. Its one input, `paint`, is required. Use it for charts, signature lines, rules and marks that text and borders cannot draw.

```ts
import { PDF_ELEMENTS, type PdfCanvasPaint } from '@ngpdf/core';

@Component({
  selector: 'app-sign-off',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page size="A5" style="padding: 36">
        <pdf-text>Approved by</pdf-text>
        <pdf-canvas [paint]="signatureLine" style="width: 200; height: 36" />
        <pdf-text style="color: #555555">Field manager</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
export class SignOffDocument {
  readonly signatureLine: PdfCanvasPaint = (ctx, { width, height }) => {
    ctx.lineWidth(0.75).moveTo(0, height - 1).lineTo(width, height - 1).stroke('#333333');
  };
}
```

## Size

A canvas has no content, so nothing sizes it from inside. Give it a `height`, or let `flex` size it. In a column it takes the full width by default, like a `pdf-view`. A canvas with no height is 0 tall, draws nothing and warns in development mode.

It takes `padding`, `border`, `background-color`, `background-image`, `border-radius`, `opacity`, `transform` and margins, like a `pdf-view`.

## The paint function

```ts
type PdfCanvasPaint = (ctx: PdfCanvasContext, size: { width: number; height: number }) => void;
```

- `paint` runs once per render, after layout, with the final size of the content box.
- Coordinates are in points, from the top left of the content box, with y going down.
- The drawing is clipped to the content box, so padding and borders frame it.
- A canvas in a [fixed view](/docs/pagination#fixed-headers-and-footers) or a repeated table header is painted once and drawn on every sheet.
- `paint` must draw synchronously. Using the context after `paint` returns throws.

Every method returns the context, so calls chain.

| Group | Methods |
| --- | --- |
| Paths | `moveTo(x, y)`, `lineTo(x, y)`, `bezierCurveTo(c1x, c1y, c2x, c2y, x, y)`, `quadraticCurveTo(cx, cy, x, y)`, `closePath()`, `rect(x, y, w, h)`, `roundedRect(x, y, w, h, r)`, `circle(cx, cy, r)`, `ellipse(cx, cy, rx, ry?)`, `polygon([x, y], …)` |
| Painting | `fill(color?, rule?)`, `stroke(color?)`, `fillAndStroke(fill?, stroke?)` |
| State | `lineWidth(w)`, `lineCap('butt' \| 'round' \| 'square')`, `lineJoin('miter' \| 'round' \| 'bevel')`, `dash(pattern, phase?)`, `undash()`, `fillColor(color)`, `strokeColor(color)`, `opacity(o)`, `save()`, `restore()` |
| Transforms | `translate(x, y)`, `rotate(degrees)`, `scale(x, y?)` |

- A path is built with the path methods, then painted. Painting starts a new path.
- `fill`, `stroke` and `fillAndStroke` use the color you pass for that paint only; without one, they use `fillColor` or `strokeColor`. Both start black.
- Colors take what the `color` style takes: hex, `rgb()` and `rgba()`, names and `transparent`. A color's alpha multiplies `opacity`.
- The fill rule is `'nonzero'` (the default) or `'evenodd'`.
- Lines start 1pt wide, with `butt` caps and `miter` joins. A line width of 0 draws no stroke.
- `dash(4)` draws 4pt dashes with 4pt gaps; `dash([6, 2])` draws 6pt dashes with 2pt gaps. Every length must be above 0.
- `rotate` turns clockwise, in degrees. Transforms apply to the points drawn after them. Line widths and dashes scale with them; under a scale that differs on x and y, they scale by the square root of the area factor.
- `save()` keeps the colors, the line settings, the opacity and the transform; `restore()` brings them back. The path is not saved.

## A bar chart

```ts
import { PDF_ELEMENTS, type PdfCanvasPaint } from '@ngpdf/core';

@Component({
  selector: 'app-orders-chart',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page size="A5" style="padding: 36">
        <pdf-text style="font-size: 16; font-weight: bold">Orders by month</pdf-text>
        <pdf-canvas
          [paint]="chart"
          style="height: 160; padding: 8; border: 1 solid #cccccc; margin-top: 12"
        />
      </pdf-page>
    </pdf-document>
  `,
})
export class OrdersChartDocument {
  readonly orders = [42, 58, 35, 71, 64, 88];

  readonly chart: PdfCanvasPaint = (ctx, { width, height }) => {
    const max = Math.max(...this.orders);
    const slot = width / this.orders.length;
    // Dashed grid lines at each quarter of the highest value.
    ctx.lineWidth(0.5).strokeColor('#dddddd').dash(2);
    for (let step = 1; step <= 4; step++) {
      const y = height - (height * step) / 4;
      ctx.moveTo(0, y).lineTo(width, y).stroke();
    }
    ctx.undash();
    this.orders.forEach((value, index) => {
      const barHeight = (value / max) * height;
      ctx.roundedRect(index * slot + slot * 0.2, height - barHeight, slot * 0.6, barHeight, 2);
      ctx.fill('#dd0031');
    });
    ctx.lineWidth(1).moveTo(0, height).lineTo(width, height).stroke('#333333');
  };
}
```

Put the labels in `pdf-text` elements next to the canvas, so they stay real, selectable text.

## Pagination

A canvas is one unit: it is never split across pages. One taller than a page goes on a page of its own and is cut at the bottom, like any other unit. See [Pagination](/docs/pagination).

## Errors

These reject the render:

- a number that is `NaN` or infinite: `ngpdf: pdf-canvas lineTo got a non-finite number`, naming the method;
- an unknown option, such as `lineCap('flat')`: `ngpdf: pdf-canvas unknown lineCap "flat"`;
- a color the `color` style would refuse: `ngpdf: invalid color "…" on pdf-canvas`;
- a negative line width or radius, a dash length of 0, an opacity outside 0 to 1, or a `restore()` without a `save()`;
- more than 100,000 calls on one canvas, where each polygon point and dash length counts as one: `ngpdf: pdf-canvas made more than 100000 calls`;
- an error thrown by `paint`: `ngpdf: pdf-canvas paint failed: <message>`.
