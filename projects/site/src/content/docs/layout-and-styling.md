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

- `background-color` fills the element's border box. There are no background images or gradients.
- `border: <width> <style> <color>`, in any order, with every part optional. The width defaults to 1 and the color to black. `none` and `hidden` remove the border.
- Per side: `border-top`, `border-right`, `border-bottom`, `border-left`, and `border-<side>-width`, `border-<side>-color`. `border-width` and `border-color` take one to four values.
- Only solid lines are drawn. `dashed`, `dotted`, `double`, `groove`, `ridge`, `inset` and `outset` are drawn solid, with a dev-mode warning. `border-style` on its own is ignored.
- `thin`, `medium` and `thick` are not supported as widths.
- `border-radius` takes one length and rounds the background. Borders on a rounded element are still drawn as square lines, so their corners stick out of the rounded background. Use a background without a border when you need rounded corners.

## Opacity

`opacity` is a number from 0 to 1 (values outside are clamped). It multiplies down the tree: a child of a view with `opacity: 0.5` is drawn at half its own opacity. Each child is faded on its own, not composited as one group, so overlapping children show through each other.

## Inheritance

Text styles are inherited from parent to child: `color`, `font-family`, `font-size`, `font-weight`, `font-style`, `line-height`, `text-align` and `text-decoration`. Set them on a `pdf-page`, a `pdf-view` or a `pdf-cell` and every text inside follows. No other property is inherited.

## What throws

Invalid values for the properties ngpdf knows throw an `Error` whose message starts with `ngpdf:` and names the element, for example `ngpdf: invalid value "middle" for text-align on pdf-text`. The render rejects with it, so check the console when a render fails. Unknown properties never throw. The full list of properties and values is in [Style properties](/docs/style-properties).
