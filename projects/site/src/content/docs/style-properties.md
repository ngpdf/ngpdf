---
title: Style properties
description: Every CSS property ngpdf reads, with its accepted values, units, defaults and inheritance, plus the properties it ignores and the values that throw.
section: Reference
order: 11
---

These are all the style properties ngpdf reads. Any other property is ignored without a warning. An invalid value for a property in this list throws an `ngpdf:` error and the render rejects.

In the tables:

- **length** is a number with an optional unit: none or `pt` (points), `px` (= 1pt), `in`, `cm` or `mm`. Any other unit throws.
- **length/%** also accepts a percentage of the parent's content box.
- **color** is hex (3, 4, 6 or 8 digits), `rgb()`/`rgba()`, a CSS named color or `transparent`.
- Keywords are matched exactly and in lower case.

## Text

All text properties are inherited by child elements.

| Property | Values | Default |
| --- | --- | --- |
| `color` | color | `black` |
| `font-family` | any text; picks Courier, Times or Helvetica | Helvetica |
| `font-size` | length ≥ 0 | `10` |
| `font-weight` | `bold`, `bolder`, a number ≥ 600 (bold); anything else is normal | normal |
| `font-style` | `italic`, `oblique` (italic); anything else is normal | normal |
| `line-height` | number (× font size), `N%`, length, `normal` (keeps the inherited value) | `1.2` |
| `text-align` | `left`, `center`, `right` | `left` |
| `text-decoration` | `none`, `underline`, `line-through` | `none` |

`font-family` contains `courier` or `mono`: Courier. Contains `times`, or `serif` without `sans`: Times. Otherwise Helvetica. See [Text and fonts](/docs/text-and-fonts).

## Flexbox

| Property | Values | Default |
| --- | --- | --- |
| `flex-direction` | `row`, `column` | `column`; `row` on `pdf-row` |
| `justify-content` | `flex-start`, `center`, `flex-end`, `space-between`, `space-around`, `space-evenly` | `flex-start` |
| `align-items` | `stretch`, `flex-start`, `center`, `flex-end` | `stretch` |
| `align-self` | `auto`, `stretch`, `flex-start`, `center`, `flex-end` | `auto` |
| `gap` | length (one value) | `0` |
| `flex` | see below | |
| `flex-grow` | number | `0` |
| `flex-shrink` | number | `1` |
| `flex-basis` | length/%, `auto` | `auto` |

`flex` takes:

| Value | grow | shrink | basis |
| --- | --- | --- | --- |
| `auto` | 1 | 1 | `auto` |
| `none` | 0 | 0 | `auto` |
| `<number>` | number | 1 | 0 |
| `<length>` | 1 | 1 | length |
| `<number> <number>` | first | second | 0 |
| `<number> <length>` | number | 1 | length |
| `<number> <number> <length>` | first | second | length |

## Size and spacing

| Property | Values | Default |
| --- | --- | --- |
| `width`, `height` | length/%, `auto` | `auto` |
| `min-width`, `min-height` | length/%, `auto` (no limit) | `auto` |
| `max-width`, `max-height` | length/%, `auto` (no limit) | `auto` |
| `margin` | 1 to 4 values of length/% or `auto` | `0` |
| `margin-top`, `margin-right`, `margin-bottom`, `margin-left` | length/%, `auto` | `0` |
| `padding` | 1 to 4 values of length/% ≥ 0 | `0` |
| `padding-top`, `padding-right`, `padding-bottom`, `padding-left` | length/% ≥ 0 | `0` |

Shorthands with 1 to 4 values follow CSS order: top, right, bottom, left.

## Borders and background

| Property | Values | Default |
| --- | --- | --- |
| `border` | `<width> <style> <color>`, each optional, in any order | none |
| `border-top`, `border-right`, `border-bottom`, `border-left` | same as `border`, for one side | none |
| `border-width` | 1 to 4 lengths | `0` |
| `border-top-width`, `border-right-width`, `border-bottom-width`, `border-left-width` | length | `0` |
| `border-color` | 1 to 4 colors | `black` |
| `border-top-color`, `border-right-color`, `border-bottom-color`, `border-left-color` | color | `black` |
| `border-radius` | one length | `0` |
| `background-color` | color | none |
| `opacity` | number from 0 to 1 (clamped) | `1` |

In `border`, a missing width is 1 and a missing color is black. The styles `none` and `hidden` set the width to 0; `solid` draws solid; `dashed`, `dotted`, `double`, `groove`, `ridge`, `inset` and `outset` are drawn solid with a dev-mode warning. `border-radius` rounds the background only; borders stay square.

## Images and pages

| Property | Values | Default |
| --- | --- | --- |
| `object-fit` | `contain`, `cover` | `contain` |
| `break-before` | `page` starts a new sheet; other values do nothing | |

## Ignored

Everything else is ignored, including:

- `display`, `position`, `top`/`right`/`bottom`/`left`, `z-index`, `overflow`;
- `flex-wrap`, `align-content`, `row-gap`, `column-gap`, `order`;
- `background`, `background-image`, `box-shadow`, `border-style`, the per-corner `border-*-radius` properties;
- `font`, `letter-spacing`, `word-spacing`, `text-transform`, `white-space`, `vertical-align`;
- custom properties (`--name`).

Some styles are ignored in specific places:

- on a component host element (with a warning);
- `width`, `height`, the `min-`/`max-` sizes and `margin` on a `pdf-page`;
- horizontal padding, left and right borders, margins, `justify-content`, `flex-direction` and `gap` on a `pdf-row` inside a table;
- margins, `min-width` and `max-width` on a `pdf-cell` inside a table;
- position and size styles other than `height` on `pdf-page-number`.

## Throws

- an unknown unit: `em`, `rem`, `vh`, `vw` and the like;
- a percentage or `auto` in `gap`, `font-size`, `border-radius`, `border-width` or a border's width;
- `auto` in `padding` or a `padding-*` side;
- a negative `font-size` or padding (margins can be negative, as in CSS);
- a color that is not one of the forms above, including `hsl()`, `currentColor` and `var()`;
- a keyword outside the lists above for `text-align`, `text-decoration`, `flex-direction`, `justify-content`, `align-items`, `align-self` and `object-fit`, upper case included;
- a value that is not a number for `flex-grow`, `flex-shrink` and `opacity`;
- the wrong number of values in a shorthand.
