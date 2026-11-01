// Public API surface of @ngpdf/core. The engine is not exported: it loads on the first render.
export {
  PDF_ELEMENTS,
  PdfCanvas,
  PdfCell,
  PdfDocument,
  PdfImage,
  PdfLink,
  PdfNote,
  PdfPage,
  PdfPageNumber,
  PdfRow,
  PdfSpan,
  PdfTable,
  PdfText,
  PdfView,
} from './lib/elements';
export type { NoteIcon, TableColumn } from './lib/elements';
export type {
  PdfCanvasContext,
  PdfCanvasFillRule,
  PdfCanvasLineCap,
  PdfCanvasLineJoin,
  PdfCanvasPaint,
  PdfCanvasSize,
} from './lib/tree/canvas-context';
export type { PageOrientation, PageSize } from './lib/elements/page';
export type { PageLayout, PageMode, PdfSecurity } from './lib/elements/document';
export { PdfRenderer, downloadPdf, renderToBlob } from './lib/render/pdf-renderer';
// For the server and viewer entry points only; not public API.
export { renderPdf as ɵrenderPdf } from './lib/render/pdf-renderer';
export { assertBrowser as ɵassertBrowser } from './lib/render/browser-only';
export { PdfDownload } from './lib/render/pdf-download';
export { providePdfFonts } from './lib/render/pdf-fonts';
export type { PdfFont } from './lib/render/pdf-fonts';
export { providePdfHyphenation } from './lib/render/pdf-hyphenation';
export type { PdfHyphenate } from './lib/render/pdf-hyphenation';
export { pdfResource } from './lib/render/pdf-resource';
export type { PdfResourceOptions, PdfResourceRef } from './lib/render/pdf-resource';
export type {
  DownloadOptions,
  DownloadPdfOptions,
  RenderOptions,
  RenderToBlobOptions,
} from './lib/render/pdf-renderer';
