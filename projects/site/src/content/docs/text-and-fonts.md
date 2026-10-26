---
title: Text and fonts
description: Write text with pdf-text, use the standard PDF fonts or your own with providePdfFonts, and learn how ngpdf falls back between fonts, wraps lines and handles line height.
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

By default ngpdf uses the standard fonts that every PDF reader has, so nothing is embedded. Of the 14 standard PDF fonts, the 12 text faces are available: Helvetica, Times and Courier, each in regular, bold, italic and bold italic. Symbol and ZapfDingbats are not available. For other fonts and for characters beyond WinAnsi, register your own: see [Custom fonts](#custom-fonts).

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

When the value names no [registered family](#custom-fonts), the family match ignores case and looks at the whole value, so `'Times New Roman', serif`, `Georgia, serif` and `serif` all give Times, and `Arial`, `Inter` or `sans-serif` give Helvetica. ngpdf never throws for a family name.

The resulting font names in the PDF are `Helvetica`, `Helvetica-Bold`, `Helvetica-Oblique`, `Helvetica-BoldOblique`, `Times-Roman`, `Times-Bold`, `Times-Italic`, `Times-BoldItalic`, `Courier`, `Courier-Bold`, `Courier-Oblique` and `Courier-BoldOblique`.

## Custom fonts

Register fonts once with `providePdfFonts`, then name them in `font-family`:

```ts
// app.config.ts
import { providePdfFonts } from '@ngpdf/core';

export const appConfig: ApplicationConfig = {
  providers: [
    providePdfFonts([
      { family: 'Inter', src: '/fonts/Inter-Regular.woff2' },
      { family: 'Inter', src: '/fonts/Inter-Bold.woff2', weight: 'bold' },
      { family: 'Noto Sans JP', src: '/fonts/NotoSansJP-Regular.ttf' },
    ]),
  ],
};
```

```html
<pdf-page style="font-family: Inter, 'Noto Sans JP'">
  <pdf-text>Zoë, Łódź, Ελληνικά, Кириллица, 日本語</pdf-text>
</pdf-page>
```

```ts
interface PdfFont {
  readonly family: string;
  readonly src: string | ArrayBuffer | Uint8Array | Blob;
  readonly weight?: 'normal' | 'bold'; // default 'normal'
  readonly style?: 'normal' | 'italic'; // default 'normal'
}
function providePdfFonts(fonts: readonly PdfFont[]): EnvironmentProviders;
```

- **Formats:** TrueType (`.ttf`), OpenType (`.otf`), WOFF and WOFF2. Font collections (`.ttc`) are not supported.
- **Sources:** `src` is a URL, a data URL, or the bytes. A URL is fetched like an image (same-origin credentials only), on the first render that needs the fonts. It is fetched once per injector and reused by later renders. A failed fetch is not kept, so the next render tries again.
- **Embedding:** each PDF embeds only the fonts its pages use, cut down to the characters it draws.
- **Matching:** `family` is matched in any case. Each face is one `weight` and `style`; register one entry per face.
- **Missing faces:** if a family has no face for the text's weight and style, ngpdf uses the closest one it has, keeping the weight first, then the regular face, and warns in development mode. It never makes a bold or italic face up.
- **Where they apply:** documents rendered with the injector that has the provider, or one below it. `providePdfFonts` in a route's `providers` adds fonts for that route's renders through `pdfResource`, `pdfDownload` and `renderToBlob`, on top of the app's. `PdfRenderer` is a root service, so it sees only the app's fonts. Several `providePdfFonts` calls in one injector add up.

### The family list and fallback

`font-family` is read as a list. Each character is drawn in the first font of the list that has it:

- A registered family is used for the characters its font has.
- A standard name in the list covers WinAnsi. The names are, in any case: `Helvetica`, `Arial`, `sans-serif` and `system-ui` for Helvetica; `Times`, `Times New Roman`, `Times-Roman` and `serif` for Times; `Courier`, `Courier New`, `monospace` and `ui-monospace` for Courier.
- Names that are neither are skipped, including web fonts such as `Open Sans` or `IBM Plex Mono` that you have not registered.
- When the list has registered families but no standard name, a standard font is added at the end, chosen from the whole value as above. So WinAnsi characters a custom font lacks are still drawn.

With `font-family: Inter, 'Noto Sans JP'`, Latin text is drawn in Inter, Japanese in Noto Sans JP, and a `€` that neither had would be drawn in Helvetica. Kerning applies within each font's run of text, not across two fonts.

A character that no font in the list has is drawn as the first font's empty glyph, usually a box. In development mode ngpdf logs one warning per render listing them:

`ngpdf: characters missing from every font in their font-family, drawn as an empty box: ☃`

If the list starts with a standard font, such a character becomes `?`, as below.

There is no right-to-left text yet, so Arabic and Hebrew are not laid out correctly, and color emoji fonts are not supported.

## Characters: WinAnsi

The standard fonts use the WinAnsi encoding (Windows-1252). Text in a [custom font](#custom-fonts) is not limited to it. It covers ASCII, the Latin-1 accented letters (`á`, `ç`, `ñ`, `ü` and so on) and a few more, such as `€`, `“ ”`, `‘ ’`, `–`, `—`, `…`, `•` and `™`.

In a standard font, any other character is drawn as `?`. That includes emoji, Greek, Cyrillic, CJK, arrows and check marks. In development mode ngpdf logs one warning per render that lists every replaced character:

`ngpdf: characters outside WinAnsi replaced with "?": ✓→`

Some characters are handled first, in every font, so they are never drawn as `?` or as a missing glyph:

- The Unicode spaces that locale data puts in pipe output, such as the thin space (U+2009) and the narrow no-break space (U+202F), and the other spaces from U+2000 to U+200A and U+205F, are drawn as a normal space. The narrow no-break space and the figure space (U+2007) become a no-break space (U+00A0), so `3:00 PM` from `date: 'short'` still does not break between the time and `PM`.
- A soft hyphen (U+00AD) and a zero-width space (U+200B) are removed. v0.1 does not break lines at them, so they are never drawn.

The same applies to the text of `pdf-page-number`.

## Wrapping

- Whitespace collapses as in CSS `white-space: normal`: runs of spaces, tabs and line breaks become one space, and the ends are trimmed. A line break in your data does not start a new line. Use one `pdf-text` per paragraph or line.
- Lines wrap at Unicode line-break opportunities (UAX #14), so they break after spaces and hyphens, and not inside words.
- A word wider than its box is broken at the box edge, between characters as you see them (grapheme clusters), so an accent stays with its letter.
- Widths include the font's kerning, and the ligatures of a custom font.
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
