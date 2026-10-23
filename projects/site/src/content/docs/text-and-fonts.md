---
title: Text and fonts
description: Write text with pdf-text, choose among the standard PDF fonts, and learn how ngpdf wraps lines, encodes characters and handles line height.
section: Guide
order: 4
---

Text goes in `pdf-text`. It stays selectable and searchable in the PDF.

```html
<pdf-page style="padding: 36; font-family: Times; font-size: 12; line-height: 1.4">
  <pdf-text style="font-size: 18; font-weight: bold">Release notes</pdf-text>
  <pdf-text>Body text set in Times-Roman.</pdf-text>
  <pdf-text style="font-style: italic; color: #555555">An italic aside.</pdf-text>
  <pdf-text style="font-family: monospace; font-size: 9">npm install &#64;ngpdf/core</pdf-text>
  <pdf-text style="text-align: center; text-decoration: line-through">Withdrawn</pdf-text>
</pdf-page>
```

The default text is Helvetica, 10pt, black, with a line height of 1.2, aligned left.

## Fonts

ngpdf uses the standard fonts that every PDF reader has, so nothing is embedded. Of the 14 standard PDF fonts, the 12 text faces are available: Helvetica, Times and Courier, each in regular, bold, italic and bold italic. Symbol and ZapfDingbats are not available. Custom fonts are planned for v0.2.

You pick a face with three properties:

| Property | Value | Result |
| --- | --- | --- |
| `font-family` | contains `courier` or `mono` | Courier |
| | contains `times`, or `serif` but not `sans` | Times |
| | anything else | Helvetica |
| `font-weight` | `bold`, `bolder`, or a number of 600 or more | bold |
| | anything else | regular |
| `font-style` | `italic` or `oblique` | italic |
| | anything else | upright |

The family match ignores case and looks at the whole value, so `'Times New Roman', serif`, `Georgia, serif` and `serif` all give Times, and `Arial`, `Inter` or `sans-serif` give Helvetica. ngpdf never throws for a family name.

The resulting font names in the PDF are `Helvetica`, `Helvetica-Bold`, `Helvetica-Oblique`, `Helvetica-BoldOblique`, `Times-Roman`, `Times-Bold`, `Times-Italic`, `Times-BoldItalic`, `Courier`, `Courier-Bold`, `Courier-Oblique` and `Courier-BoldOblique`.

## Characters: WinAnsi

The standard fonts use the WinAnsi encoding (Windows-1252). It covers ASCII, the Latin-1 accented letters (`á`, `ç`, `ñ`, `ü` and so on) and a few more, such as `€`, `“ ”`, `‘ ’`, `–`, `—`, `…`, `•` and `™`.

Any other character is drawn as `?`. That includes emoji, Greek, Cyrillic, CJK, arrows and check marks. In development mode ngpdf logs one warning per render that lists every replaced character:

`ngpdf: characters outside WinAnsi replaced with "?": ✓→`

Some characters are handled before that, so they never become `?`:

- The Unicode spaces that locale data puts in pipe output, such as the thin space (U+2009) and the narrow no-break space (U+202F), and the other spaces from U+2000 to U+200A and U+205F, are drawn as a normal space. The narrow no-break space and the figure space (U+2007) become a no-break space (U+00A0), so `3:00 PM` from `date: 'short'` still does not break between the time and `PM`.
- A soft hyphen (U+00AD) and a zero-width space (U+200B) are removed. v0.1 does not break lines at them, so they are never drawn.

The same applies to the text of `pdf-page-number`. Fonts beyond WinAnsi come with custom fonts in v0.2.

## Wrapping

- Whitespace collapses as in CSS `white-space: normal`: runs of spaces, tabs and line breaks become one space, and the ends are trimmed. A line break in your data does not start a new line. Use one `pdf-text` per paragraph or line.
- Lines wrap at Unicode line-break opportunities (UAX #14), so they break after spaces and hyphens, and not inside words.
- A word wider than its box is broken at the box edge.
- Widths include the font's kerning.
- There is no hyphenation, no `text-align: justify` and no right-to-left text in v0.1.

A `pdf-text` is one pagination unit and is never split across pages. Long text belongs in several `pdf-text` elements, one per paragraph, so the paragraphs can flow onto the next page. See [Pagination](/docs/pagination).

## Line height

| Value | Meaning |
| --- | --- |
| `1.4` | 1.4 × the font size. A bare number is always a multiplier, so `14` means 14 × the font size. |
| `140%` | 1.4 × the font size |
| `14pt`, `5mm`, `0.2in` | a fixed line height |
| `normal` | keeps the inherited line height |

Write a length with its unit, such as `line-height: 14pt`, when you mean points. A length is divided by the element's own font size, and the resulting ratio is inherited.

ngpdf places text at the top of its line box. Extra line height goes below the text, not half above and half below as in CSS. A block of text is `number of lines × font-size × line-height` high.

## Alignment and decoration

- `text-align`: `left`, `center` or `right`. It aligns each line inside the `pdf-text` box. In a row, a `pdf-text` is only as wide as its text, so give it a width or `flex: 1` when you want alignment to show. Inside a column, the box takes the full width.
- `text-decoration`: `none`, `underline` or `line-through`. One value only.
- `color` and `opacity` apply to the text.

Unlike CSS, all text styles, `text-decoration` included, are inherited by child elements.

## Nested pdf-text

A `pdf-text` inside a `pdf-text` is flattened to its text, and its own style is lost. So one bold word inside a sentence is not possible in v0.1. Elements other than text inside a `pdf-text` are not laid out.

## Bare text

Text written directly in an element other than `pdf-text` is laid out as an anonymous `pdf-text` with its parent's text styles:

```html
<pdf-cell style="font-weight: bold">{{ total() }}</pdf-cell>
<!-- is laid out as -->
<pdf-cell style="font-weight: bold"><pdf-text>{{ total() }}</pdf-text></pdf-cell>
```

Each run of text between elements becomes one anonymous box. Runs that are only whitespace are dropped. Text inside `pdf-image` and `pdf-page-number`, and text directly in `pdf-document`, is ignored.
