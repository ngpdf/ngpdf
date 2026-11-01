---
title: Layout and styling
description: How ngpdf lays out pdf-* elements with flexbox through Yoga, how to write styles and bindings, and which units, colors and borders work.
section: Guide
order: 3
---

ngpdf lays elements out with flexbox, computed by [Yoga](https://www.yogalayout.dev/). You style elements with CSS declarations in the `style` attribute or with `[style.*]` bindings. There are no stylesheets and no classes.

## Writing styles

Three forms work, on any `pdf-*` element:

```html
<!-- a static style attribute -->
<pdf-view style="flex-direction: row; gap: 12; padding: 8">…</pdf-view>

<!-- a binding per property, with an optional unit suffix -->
<pdf-view [style.background-color]="highlight() ? '#fff3cd' : null" [style.width.%]="progress()" />

<!-- an object binding -->
<pdf-text [style]="{ color: '#c62828', 'font-weight': 'bold' }">Overdue</pdf-text>
```

You can combine a static `style` with bindings on the same element. A binding set to `null` or `undefined` removes that property. Property names can be kebab-case or camelCase (`backgroundColor` becomes `background-color`).

What has no effect:

- `class` and `[class.*]` bindings, and the component's `styles` or `styleUrl`. They are CSS for the DOM, and a document has no DOM.
- Styles on the host element of your own components. ngpdf ignores them with a dev-mode warning. See [Components in documents](/docs/components-in-documents).
- Properties ngpdf does not know, such as `display`, `position`, `top`, `flex-wrap`, `font` or `background`. They are ignored without a warning.

The style attribute is split on `;` outside quotes and parentheses, so a value such as `url(data:image/png;base64,...)` or `"A;B"` stays whole. Keywords are matched in any case, as in CSS: `text-align: CENTER` is `center` and `font-weight: BOLD` is `bold`. `!important` and `var()` are not supported.

## Flexbox

Every element is a flex container. The defaults follow CSS flexbox, with one difference: the default direction is `column`, as in React Native, except for `pdf-row`, which defaults to `row`.

| Property | Values | Default |
| --- | --- | --- |
| `flex-direction` | `row`, `column` | `column` (`row` on `pdf-row`) |
| `justify-content` | `flex-start`, `center`, `flex-end`, `space-between`, `space-around`, `space-evenly` | `flex-start` |
| `align-items` | `stretch`, `flex-start`, `center`, `flex-end` | `stretch` |
| `align-self` | `auto`, `stretch`, `flex-start`, `center`, `flex-end` | `auto` |
| `gap` | one length | `0` |
| `flex` | `<grow> [<shrink>] [<basis>]`, `auto`, `none` | |
| `flex-grow` | number | `0` |
| `flex-shrink` | number | `1` |
| `flex-basis` | length, `%`, `auto` | `auto` |

`flex: 1` means grow 1, shrink 1, basis 0, as in CSS. `row-reverse`, `column-reverse`, `flex-wrap`, `align-content`, `baseline` and separate `row-gap`/`column-gap` are not supported.

Sizing uses `width`, `height`, `min-width`, `min-height`, `max-width` and `max-height`, plus `margin` and `padding` with one to four values, or per side (`margin-top`, `padding-left`, and so on).

```html
<pdf-view
  style="flex-direction: row; justify-content: space-between; align-items: center; gap: 12; padding-bottom: 8; border-bottom: 1 solid #cccccc"
>
  <pdf-text style="font-size: 18; font-weight: bold">Order #{{ orderId() }}</pdf-text>
  <pdf-text style="color: #666666">Shipped</pdf-text>
</pdf-view>
<pdf-view style="flex-direction: row; gap: 12; margin-top: 12">
  <pdf-view style="flex: 2; padding: 8; background-color: #f4f6f8; border-radius: 4">
    <pdf-text>Shipping address</pdf-text>
  </pdf-view>
  <pdf-view style="flex: 1; padding: 8; border: 1 solid #dddddd">
    <pdf-text>Notes</pdf-text>
  </pdf-view>
</pdf-view>
```

A page has no fixed height during layout: content is laid out at the page's content width with unbounded height, then cut into sheets. See [Pagination](/docs/pagination).

## Units

| Unit | Meaning |
| --- | --- |
| none | points. `12` is 12pt. |
| `pt` | points, 1/72 inch |
| `px` | 1px = 1pt |
| `in` | 72pt |
| `cm` | 72/2.54pt |
| `mm` | 72/25.4pt |
| `%` | of the parent's content box |

Any other unit, such as `em`, `rem` or `vh`, throws `ngpdf: unknown unit in "<value>"`.

Percentages work in `width`, `height`, the `min-`/`max-` sizes, `margin`, `padding` and `flex-basis`. `gap`, `font-size`, `border-radius` and border widths take a length only; a percentage there throws.

`line-height` is the exception to "a bare number is points": there it multiplies the font size, as in CSS. See [Text and fonts](/docs/text-and-fonts).

## Colors

`color`, `background-color` and the border colors accept:

- hex with 3, 4, 6 or 8 digits: `#333`, `#3338`, `#333333`, `#33333380`;
- `rgb()` and `rgba()`, with commas or spaces and a slash, numbers or percentages: `rgb(51, 51, 51)`, `rgb(51 51 51 / 50%)`, `rgba(0, 0, 0, 0.5)`;
- the CSS named colors, in any case: `steelblue`, `Navy`;
- `transparent`.

Anything else, such as `hsl()`, `currentColor` or `var(--brand)`, throws `ngpdf: invalid color "<value>"`. An alpha channel is drawn as opacity.

## Backgrounds, borders and radius

- `background-color` fills the element's border box.
- `background-image` takes one `linear-gradient()` or `radial-gradient()`, or `none`. The gradient fills the border box over the background color, follows `border-radius`, and is not inherited. `background` is a shorthand for a color, a gradient, or one of each: `background: linear-gradient(to right, #dd0031, #c3002f) #dd0031`.
- `border: <width> <style> <color>`, in any order, with every part optional. The width defaults to 1 and the color to black. `none` and `hidden` remove the border.
- Per side: `border-top`, `border-right`, `border-bottom`, `border-left`, and `border-<side>-width`, `border-<side>-color`. `border-width` and `border-color` take one to four values.
- Only solid lines are drawn. `dashed`, `dotted`, `double`, `groove`, `ridge`, `inset` and `outset` are drawn solid, with a dev-mode warning. `border-style` on its own is ignored.
- `thin`, `medium` and `thick` are not supported as widths.
- `border-radius` takes one to four lengths, from the top-left corner clockwise, as in CSS. `border-top-left-radius`, `border-top-right-radius`, `border-bottom-right-radius` and `border-bottom-left-radius` set one corner. The background and the borders both follow the rounded corners. When the radii on a side add up to more than its length, all four are scaled down together.
- Where two border sides of different widths or colors meet at a rounded corner, each keeps its own up to the middle of the arc.
- A view split across pages keeps square corners where the page cuts it.
- Children and images of a rounded view are not clipped to its corners unless it has an [`overflow`](#overflow) other than `visible`.

## Overflow

By default, content that does not fit its box is drawn outside it. `overflow: hidden` clips it:

```html
<pdf-view style="overflow: hidden; height: 120; border: 1 solid #ccc; border-radius: 8">
  <pdf-image [src]="photo" style="height: 160; object-fit: cover" />
  <pdf-text>{{ caption() }}</pdf-text>
</pdf-view>
```

- The element's children, text and image are clipped to its padding box, inside the border. Its own background and border are not clipped.
- With `border-radius`, the clip is rounded too. Each corner's radius is the outer radius less the wider of the two borders beside it, never below 0.
- `clip`, `scroll` and `auto` clip like `hidden`. `overflow-x` and `overflow-y` are ignored.
- Nested clipping elements clip to the area they share.
- The layout does not change: sizes and positions are the same with or without clipping.
- A column `pdf-view` or a `pdf-text` with `overflow: hidden`, `clip`, `scroll` or `auto` is one [pagination unit](/docs/pagination#units), so it is never split across sheets. One taller than a sheet is cut at the bottom, with a dev-mode warning, and the rest is not drawn.
- `overflow` is not inherited, and is ignored on a `pdf-page` (a page is not a box to clip) and on a `pdf-table`, which keeps breaking between its rows.

## Gradients

`linear-gradient()` takes an optional direction, then two or more color stops:

- the direction is an angle in `deg`, `rad` or `turn` (`0deg` points up, `90deg` right), or `to` with a side or a corner: `to right`, `to top left`. The default is `to bottom`. The gradient line is as long as CSS makes it, so `45deg` and `to top right` reach the corners;
- a stop is a color with an optional position in `%` of the gradient line or a length: `#dd0031 20%`, `white 40pt`. Stops without a position are spread evenly between their neighbours, and a position smaller than an earlier one is raised to it, as in CSS. Two stops at one position make a hard edge.

`radial-gradient()` takes an optional shape, size and center, then the stops:

- the shape is `circle` or `ellipse` (the default);
- the size is `closest-side`, `closest-corner`, `farthest-side` or `farthest-corner` (the default);
- the center is `at` one or two values, keywords (`left`, `center`, `right`, `top`, `bottom`), lengths or percentages of the box. The default is `at center`;
- stop positions are measured along the horizontal radius.

```html
<pdf-view style="padding: 12; background: radial-gradient(circle at top left, #ffffff55, transparent 60%) #1f2a44">
  <pdf-text style="color: white">Quarterly report</pdf-text>
</pdf-view>
```

A stop's alpha and the element's `opacity` multiply into the stop's opacity. A transparent stop takes the color of its neighbours, so `linear-gradient(red, transparent)` fades the red out instead of darkening it. A view split across pages keeps one gradient for its whole height: each sheet shows its part, like `box-decoration-break: slice`.

These throw an `ngpdf:` error: `repeating-linear-gradient()`, `repeating-radial-gradient()`, `conic-gradient()`, `url()`, several comma-separated backgrounds, explicit radial sizes such as `circle 40px`, color hints (`red, 30%, blue`) and stops with two positions.

## Opacity

`opacity` is a number from 0 to 1 (values outside are clamped). It multiplies down the tree: a child of a view with `opacity: 0.5` is drawn at half its own opacity. Each child is faded on its own, not composited as one group, so overlapping children show through each other.

## Transforms

`transform` rotates, scales and moves an element when it is drawn, as in CSS:

```html
<pdf-view
  style="transform: rotate(-12deg); align-self: flex-end; padding: 6 12; border: 2 solid #c62828; border-radius: 4"
>
  <pdf-text style="color: #c62828; font-size: 18; font-weight: bold">PAID</pdf-text>
</pdf-view>
```

- The functions are `rotate()`, `scale()`, `scaleX()`, `scaleY()`, `translate()`, `translateX()` and `translateY()`, applied left to right. Function names are matched in any case.
- Angles take `deg`, `rad` or `turn`. A positive angle turns clockwise.
- `scale(2)` scales both axes and `scale(2, 0.5)` each one. Translations take lengths, or a percentage of the element's own border box.
- `transform-origin` takes one or two values: `left`, `center`, `right`, `top`, `bottom`, lengths or percentages of the border box. It defaults to `center`.
- The whole element is transformed: its background, border, children, text and image. Its [`overflow`](#overflow) clip turns with it.
- The layout does not change: sizes and positions are the same with or without a transform, and nothing around the element moves.
- A transformed element can be drawn outside its box, past the page margins or off the sheet. Only an ancestor with an `overflow` other than `visible` clips it.
- A column `pdf-view` with a transform is one [pagination unit](/docs/pagination#units), and a transformed `pdf-text` stays whole on one sheet, so a rotated box is never cut across sheets.
- Neither property is inherited. `transform` is ignored on a `pdf-page` and on a `pdf-table`, which keeps breaking between its rows; its value is still checked.
- `skew()`, `matrix()` and the 3D functions throw, like any unknown function.

## Positioning

`position` takes an element out of its place in the flow, as in CSS. A stamp in the corner of a card:

```html
<pdf-view style="position: relative; padding: 16; border: 1 solid #ccc">
  <pdf-text>Invoice 2026-114</pdf-text>
  <pdf-view
    style="position: absolute; top: 8; right: 8; padding: 2 6; background-color: #2e7d32"
  >
    <pdf-text style="color: white; font-size: 8; font-weight: bold">PAID</pdf-text>
  </pdf-view>
</pdf-view>
```

- `position` is `static` (the default), `relative` or `absolute`. `fixed` and `sticky` throw: for a header or footer on every sheet, use a [fixed view](/docs/pagination#fixed-headers-and-footers).
- `top`, `right`, `bottom` and `left` take a length, a percentage or `auto` (the default). They do nothing on a `static` element.
- A `relative` element is drawn moved by its offsets, with everything it holds. The layout does not change: its siblings stay where they were. `top` wins over `bottom` and `left` over `right`, and a percentage is of the parent's content box.
- An `absolute` element leaves the flow: it takes no space, and its parent's size ignores it. It is placed against the padding box of its nearest `relative`, `absolute` or transformed ancestor, its containing block, or against the content area of its `pdf-page` when there is none. A percentage is of that padding box.
- With `left` and `right` both set and `width: auto`, an absolute element stretches between them, and the same goes for `top`, `bottom` and the height. Otherwise it takes its `width` and `height`, or the size of its content.
- Positioned elements are drawn after the in-flow ones, so they sit on top of them. Positioned elements of the same containing block, at any depth, are drawn in template order. The exception is a `relative` element inside a static element with an [`overflow`](#overflow) clip: it is drawn with that element, inside its clip, before any absolute element that escapes the clip. An absolute element is drawn with its containing block: inside its [`overflow`](#overflow) clip and its [transform](#transforms). A static clipping element between them does not clip it, as in CSS.
- An absolute element is never split across sheets; [Pagination](/docs/pagination#positioned-elements) says where it goes.
- `z-index` is not supported. None of these properties is inherited. They are ignored on `pdf-page`, `pdf-row` and `pdf-cell`, whose values are still checked, and have no effect on a `pdf-span`.

## Inheritance

Text styles are inherited from parent to child: `color`, `font-family`, `font-size`, `font-weight`, `font-style`, `line-height`, `text-align`, `text-decoration`, `letter-spacing` and `text-transform`. Set them on a `pdf-page`, a `pdf-view` or a `pdf-cell` and every text inside follows. No other property is inherited.

## What throws

Invalid values for the properties ngpdf knows throw an `Error` whose message starts with `ngpdf:` and names the element, for example `ngpdf: invalid value "middle" for text-align on pdf-text`. The render rejects with it, so check the console when a render fails. Unknown properties never throw. The full list of properties and values is in [Style properties](/docs/style-properties).
