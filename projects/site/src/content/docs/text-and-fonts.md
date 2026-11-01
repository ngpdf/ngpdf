---
title: Text and fonts
description: Write text with pdf-text, use the standard PDF fonts or your own with providePdfFonts, and learn how ngpdf falls back between fonts, wraps lines, hyphenates words, cuts text with max-lines and handles line height.
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
- **Sources:** `src` is a URL, a data URL, or the bytes. A URL is fetched like an image (same-origin credentials only), on the first render whose document names its family. A font no document names is never fetched, so a broken font file fails only the documents that use it. It is fetched once per injector and reused by later renders. A failed fetch is not kept, so the next render tries again. On the server, a font URL is read only through `renderToBuffer`'s `fetchImage`; see [Server rendering](/docs/server-rendering#images-and-fonts-on-the-server).
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
- Vertical tab, form feed, next line (U+0085), and the line and paragraph separators (U+2028, U+2029) are drawn as a normal space, so they collapse and trim like any other whitespace.
- The ideographic space (U+3000) and the Ogham space mark (U+1680) are kept for a custom font that has them, and drawn as a normal space when no font in the list has them and the list starts with a standard font. They are trimmed at the ends of the text but never collapsed.
- A zero-width space (U+200B) and U+FEFF (a byte order mark or zero-width no-break space) are removed. ngpdf does not break lines at them, so they are never drawn.
- A soft hyphen (U+00AD) is never drawn itself. It marks a place where a word may break, with a hyphen drawn at the end of the line; see [Hyphenation](#hyphenation).

The same applies to the text of `pdf-page-number`.

## Wrapping

- Whitespace collapses as in CSS `white-space: normal`: runs of spaces, tabs and line breaks become one space, and the ends are trimmed. A line break in your data does not start a new line. Use one `pdf-text` per paragraph or line.
- Lines wrap at Unicode line-break opportunities (UAX #14), so they break after spaces and hyphens, and not inside words.
- A word wider than its box is broken at the box edge, between characters as you see them (grapheme clusters), so an accent stays with its letter.
- Widths include the font's kerning, and the ligatures of a custom font.
- Words break with a hyphen at soft hyphens, and with `hyphens: auto` where your hyphenation function allows. See [Hyphenation](#hyphenation).
- There is no right-to-left text.

A long `pdf-text` breaks between lines at a page break, keeping `orphans` lines (default 2) before the break and `widows` lines (default 2) after it. `break-inside: avoid` keeps it whole. See [Text across pages](/docs/pagination#text-across-pages).

## Hyphenation

`hyphens` sets where a word may break with a hyphen at the end of the line. It is inherited, and a `pdf-span` can set it for its own text.

| Value | Where words break |
| --- | --- |
| `manual` (default) | at soft hyphens (U+00AD, `&shy;` in a template) |
| `none` | nowhere: soft hyphens are ignored, and still not drawn |
| `auto` | at soft hyphens, and where the function from `providePdfHyphenation` allows |

```html
<pdf-text style="width: 90pt">Pay the extra&shy;ordinary invoice today.</pdf-text>
```

- A word is hyphenated only when it does not fit on what is left of the line. The line then takes as many pieces of it as fit, plus the hyphen. A word that does not fit even an empty line is cut at the box edge only when no piece fits.
- The hyphen is drawn in the font of the text it ends: `‐` (U+2010) when the font has it, `-` otherwise. The standard fonts have no U+2010, so they draw `-`. It counts in the line's width, is underlined or struck through with the text, and is copied with it.
- A soft hyphen where the line does not break draws nothing and takes no width.
- Justified text, `max-lines`, `letter-spacing` and `text-transform` work on hyphenated lines. A line cut by `max-lines` ends with `…`, not a hyphen.

### Automatic hyphenation

ngpdf ships no hyphenation patterns, because they are large and differ by language. For `hyphens: auto`, give it a function that cuts a word into the pieces it may break between:

```ts
type PdfHyphenate = (word: string, language: string | undefined) => readonly string[];
function providePdfHyphenation(hyphenate: PdfHyphenate): EnvironmentProviders;
```

- `language` is the `language` of the `pdf-document`, so one function can serve several languages.
- The pieces must join back to the word: `'hyphenation'` gives `['hy', 'phen', 'ation']`. A function that throws, or returns anything else, means that word is not hyphenated automatically, with one warning in development mode. Like any word too long for its box, it can still break at the box edge.
- Only words of 5 letters or more are hyphenated, with at least 2 letters on each side of the break, as browsers do by default. Punctuation around a word stays outside it.
- `text-transform` applies first, so the function gets the transformed word.
- A word that has soft hyphens breaks only at them.
- The function is called only for words that do not fit their line, at most once per word and render.
- Without the provider, `auto` breaks at soft hyphens only, and warns once per render in development mode.
- Like `providePdfFonts`, it applies to documents rendered with its injector or one below it, so a route or a child injector can have its own. `pdfResource`, `pdfDownload` and `renderToBlob` see a route's provider. `PdfRenderer` is a root service, so it sees only the app's: to use a route's function, pass the route's injector to `renderToBlob` or `downloadPdf`, as below.

A pattern library, such as the `hyphen` package from npm, can back the function. `hyphen` ships no type declarations, so a TypeScript app also installs `@types/hyphen`:

```sh
npm install hyphen
npm install --save-dev @types/hyphen
```

Load it lazily, so its patterns stay out of your initial bundle and load only when a document needs them:

```ts
// pdf-hyphenation.ts
import { providePdfHyphenation } from '@ngpdf/core';

let hyphenateEn: ((text: string) => string) | undefined;

/** Loads the English patterns once; await it before rendering a hyphenated document. */
export async function loadHyphenation(): Promise<void> {
  hyphenateEn ??= (await import('hyphen/en')).hyphenateSync;
}

// hyphenateSync puts a soft hyphen at each break, so splitting on it gives the pieces.
export const pdfHyphenation = providePdfHyphenation((word) =>
  hyphenateEn ? hyphenateEn(word).split('\u00ad') : [word],
);
```

```ts
// app.config.ts: providers: [pdfHyphenation]
// in the component that renders:
await loadHyphenation();
await this.pdf.download(ReportDocument, { fileName: 'report.pdf' });
```

With `pdfHyphenation` in a route's `providers` instead, render with that route's injector, since `PdfRenderer` would not see it:

```ts
// in a component of that route
private readonly injector = inject(EnvironmentInjector);

async save(): Promise<void> {
  await loadHyphenation();
  await downloadPdf(ReportDocument, { injector: this.injector, fileName: 'report.pdf' });
}
```

## Cutting text to a number of lines

`max-lines` keeps at most that many lines of a `pdf-text`. When text was cut, the last kept line ends with an ellipsis: characters come off its end until the line and `…` fit the box. The ellipsis is drawn in the style of the last character kept on that line. A font without `…` gets `...` instead. The standard fonts have it. In a box too narrow for the ellipsis itself, the line is left empty. With `text-align: justify`, the cut line is not stretched, like a paragraph's last line.

```html
<pdf-cell><pdf-text style="max-lines: 2">{{ product.description }}</pdf-text></pdf-cell>
```

The box is as tall as the kept lines. `max-lines: none`, the default, keeps every line. The property is not inherited, so set it on the `pdf-text` itself.

## Line height

| Value | Meaning |
| --- | --- |
| `1.4` | 1.4 × the font size. A bare number is always a multiplier, so `14` means 14 × the font size. |
| `140%` | 1.4 × the font size |
| `14pt`, `5mm`, `0.2in` | a fixed line height |
| `normal` | keeps the inherited line height |

Write a length with its unit, such as `line-height: 14pt`, when you mean points. A length is divided by the element's own font size, and the resulting ratio is inherited.

ngpdf places text at the top of its line box. Extra line height goes below the text, not half above and half below as in CSS. Each line is `font-size × line-height` high, using the largest font size on the line, so a block of text in one size is `number of lines × font-size × line-height` high.

## Alignment and decoration

- `text-align`: `left`, `center`, `right` or `justify`. It aligns each line inside the `pdf-text` box. In a row, a `pdf-text` is only as wide as its text, so give it a width or `flex: 1` when you want alignment to show. Inside a column, the box takes the full width.
- `justify` widens the gaps between words so that each line reaches both edges of the box. The last line of the paragraph stays at the left, as in CSS. So does a line with a single word, and a word wider than the box. A gap is a run of spaces or no-break spaces, and only gaps are widened: the space between letters stays as the font and `letter-spacing` set it. A paragraph split across pages keeps its lines justified up to its real last line.
- `text-decoration`: `none`, `underline` or `line-through`. One value only.
- `letter-spacing`: a length added after each character, the last one on a line included, as in browsers. It can be negative; `normal` is 0. Wrapping, alignment, justified text and `max-lines` all use the spaced width. A letter and its combining marks count as one character. As in CSS, spaced text drops the optional ligatures of a custom font, such as `fi`. Text extractors such as `pdftotext` guess spaces from the gaps between letters, so spacing above about a tenth of the font size can come out as `N O R T H` when the text is copied.
- `text-transform`: `none`, `uppercase`, `lowercase` or `capitalize`. The text is transformed before it is measured, so lines break where the transformed text fits. Case changes don't depend on a locale, so `ß` becomes `SS`. `capitalize` uppercases the first letter of each word, a word being what follows the start of the paragraph or a space, across spans; punctuation before the letter is skipped, and a word that starts with a digit is left as it is. The page number is never transformed.
- `color` and `opacity` apply to the text.

Unlike CSS, all text styles, `text-decoration` included, are inherited by child elements.

## Styled runs: pdf-span

Wrap part of a text in a `pdf-span` to draw it in other text styles:

```html
<pdf-text style="font-size: 11pt">
  Invoice <pdf-span style="font-weight: bold">#{{ number() }}</pdf-span> is
  <pdf-span style="color: #b00020">{{ days() }} days overdue</pdf-span>.
</pdf-text>
```

- A span inherits the text styles around it and can change `color`, `font-family`, `font-size`, `font-weight`, `font-style`, `text-decoration`, `letter-spacing`, `text-transform` and `hyphens`. Spans nest.
- The paragraph wraps as one text: a span boundary is not a place to break, and a span wraps over lines like the rest of the text. Kerning is not applied across two spans.
- Runs of different sizes share a baseline, and a line is as tall as its largest font size times the paragraph's `line-height`.
- `line-height` and `text-align` belong to the `pdf-text`. Other properties on a span, such as padding or a background, have no effect and get a warning in development mode.
- A span is drawn in the fonts its own `font-family` names, with the same fallback as any text.
- `@if`, `@for` and components work inside a `pdf-text` as anywhere else.

A `pdf-text` inside a `pdf-text` is drawn in the outer text's style, with a warning in development mode: use `pdf-span` instead. Elements other than `pdf-span`, `pdf-link` and text inside a `pdf-text` are not laid out.

## Links: pdf-link

`pdf-link` makes text or a box open a URL when clicked in a PDF viewer:

```html
<pdf-text>
  Pay it at
  <pdf-link [href]="payUrl" style="color: #1a56db; text-decoration: underline">example.com/pay</pdf-link>.
</pdf-text>

<pdf-link href="https://example.com/invoices/1024" style="padding: 8; border: 1 solid #1a56db">
  <pdf-text>Open the invoice</pdf-text>
</pdf-link>
```

- Inside a `pdf-text`, a link is inline, like a `pdf-span`: it takes the same text styles, and each piece of a line it covers is clickable. A link that wraps over two lines is two clickable areas.
- Anywhere a `pdf-view` can go, a link is a column `pdf-view`, and its border box is the clickable area.
- A link changes nothing visually: it has no default color or underline. Style it with `color` and `text-decoration`.
- Only absolute `http:`, `https:` and `mailto:` URLs are written, in the normalized form the browser's `URL` gives them (`HTTP://Example.COM` becomes `http://example.com/`). Any other scheme (`javascript:`, `file:`, `data:` and so on), a relative URL or one that does not parse writes no link: the content is still drawn, with a warning in development mode naming the URL. Links often come from data, so a bad one does not fail the render.
- Links do not nest: a `pdf-link` inside a `pdf-link` fails the render with `ngpdf: pdf-link inside a pdf-link`, as nested links are invalid in HTML.
- A clickable area is an upright rectangle. Inside a `transform`, it is the smallest rectangle around the transformed area. It is cut at the bottom of the page's content area, but not by an `overflow` clip: PDF viewers cannot clip a link area, so a link inside a clipped box stays clickable over its whole box.
- A block link split across sheets is clickable on each sheet over its part. See [Pagination](/docs/pagination#wrapper-backgrounds-and-borders).

### Links to a place in the document

Give an element an `anchor` name, and a `pdf-link` with `href="#name"` jumps to it, as a table of contents does:

```html
<pdf-text>See <pdf-link href="#prices" style="color: #1a56db">the price list</pdf-link>.</pdf-text>

<pdf-table anchor="prices" [columns]="['1fr', 80]">…</pdf-table>
```

- `pdf-view`, `pdf-text`, `pdf-image`, `pdf-table`, `pdf-row` and `pdf-cell` take `anchor`.
- The link jumps to the sheet where the element's first piece lands, with the top left of that piece at the top left of the window, at the reader's zoom. For a text split across sheets that is its first lines; for an element in a fixed view, the first sheet.
- Names are trimmed, and an empty name is ignored. When two elements have the same name, the first one in the template keeps it, with a warning in development mode: `ngpdf: duplicate anchor "<name>"`.
- A link to a name that no element has writes no link: the content is still drawn, with a warning in development mode.
- In the PDF, each anchor a link uses is a named destination, so a viewer can also open the file at it, as in `report.pdf#nameddest=prices`. An anchor no link or bookmark uses writes nothing.

## Bare text

Text written directly in an element other than `pdf-text` is laid out as an anonymous `pdf-text` with its parent's text styles:

```html
<pdf-cell style="font-weight: bold">{{ total() }}</pdf-cell>
<!-- is laid out as -->
<pdf-cell style="font-weight: bold"><pdf-text>{{ total() }}</pdf-text></pdf-cell>
```

Each run of text between elements becomes one anonymous box. Runs that are only whitespace are dropped. Text inside `pdf-image` and `pdf-page-number`, and text directly in `pdf-document`, is ignored.
