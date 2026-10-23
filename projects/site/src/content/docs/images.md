---
title: Images
description: Add PNG and JPEG images with pdf-image from a data URL, a URL, a Blob or an ArrayBuffer, and control their size with width, height and object-fit.
section: Guide
order: 7
---

`pdf-image` draws a PNG or JPEG image. Its one input, `src`, is required.

```ts
@Component({
  selector: 'app-badge-document',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page size="A5" style="padding: 24">
        <pdf-view style="flex-direction: row; gap: 12; align-items: center">
          <pdf-image src="/assets/logo.png" style="width: 48" />
          <pdf-text style="font-size: 16">Visitor badge</pdf-text>
        </pdf-view>
        <pdf-image
          [src]="photo()"
          style="width: 120; height: 160; object-fit: cover; margin-top: 12; border: 1 solid #cccccc"
        />
      </pdf-page>
    </pdf-document>
  `,
})
export class BadgeDocument {
  readonly photo = input.required<Blob>();
}
```

## Sources

`src` is a `string`, a `Blob` or an `ArrayBuffer`.

| Source | How ngpdf reads it |
| --- | --- |
| a string starting with `data:` | decoded in place, base64 or percent-encoded |
| any other string | downloaded with the browser's `fetch` |
| a `Blob` (or a `File`) | read with `blob.arrayBuffer()` |
| an `ArrayBuffer` | used as it is |

The format is detected from the bytes, not from the URL, the file name or the MIME type. PNG and JPEG are supported. SVG, GIF, WebP and other formats fail with `image is neither PNG nor JPEG`. To use them, draw them on a `<canvas>` and pass `canvas.toBlob(…, 'image/png')`:

```ts
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the chart'))), 'image/png');
  });
}
```

A typed array such as `Uint8Array` is not accepted. Pass its bytes as an `ArrayBuffer`:

```ts
export function toImageSource(bytes: Uint8Array): ArrayBuffer {
  // pdf-image takes an ArrayBuffer, not a typed array; slice() copies just this view's bytes.
  return bytes.slice().buffer;
}
```

The `data:` prefix is matched in lower case only. An upper-case `DATA:` URL is passed to `fetch` instead.

## Fetching URLs

- ngpdf calls `fetch(src, { credentials: 'same-origin' })`. A relative URL such as `/assets/logo.png` resolves against your page, as any `fetch` does.
- The request runs under your page's CORS rules and Content-Security-Policy. An image on another origin needs CORS headers that allow your origin; cookies are sent only to your own origin.
- A response that is not OK fails, for example with `HTTP 404`.
- There is no size limit and no timeout: a very large image is downloaded in full.
- All images of a document load in parallel before layout. The same string `src` used several times in one render is fetched once.

## Errors

The first image that fails rejects the whole render with:

`ngpdf: could not load image "<source>": <reason>`

`<source>` is the URL without its query string and fragment (they often carry a token), or `data URL`, `Blob` or `ArrayBuffer`. `<reason>` is the cause, such as `HTTP 404`, the browser's network error, or `ngpdf: image is neither PNG nor JPEG`. Nothing is downloaded on failure, and the document component is destroyed.

## Size

The image keeps its aspect ratio unless you give it both dimensions.

| You set | Result |
| --- | --- |
| nothing | natural size, 1 image pixel = 1pt, capped to the width available |
| `width` only | the height follows the aspect ratio |
| `height` only | the width follows the aspect ratio |
| `width` and `height` | the box you set; `object-fit` places the image in it |

A JPEG with an EXIF orientation, as phone photos usually have, is drawn turned the way browsers show it, and its size and aspect ratio are those of the turned picture: a photo stored 4000x3000 with a quarter-turn orientation (5 to 8) is 3000 wide and 4000 high. The orientation is read from the first APP1 segment among those right after the start of the file, which is where cameras write it.

A 2x image (for example a canvas captured at twice the screen size) therefore comes out twice as large as on screen. Set a `width` to scale it.

An image with no size set is not stretched by its parent's default `align-items: stretch`. Set `align-self: stretch` to make it take the full width, with its height following.

## object-fit

When the box and the image have different proportions:

- `contain` (the default) scales the image to fit inside the box and centers it.
- `cover` scales it to fill the box, centers it, and clips what overflows.

The image is drawn inside the content box, so padding and borders on a `pdf-image` frame it. `opacity` applies to the image.

## Things to avoid

- Do not put children inside `pdf-image`. They are not supported and can make the render fail.
- Do not rely on `src` changing after the render starts. The component is rendered once.
