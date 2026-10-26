// Public API surface of @ngpdf/core. The engine is not exported: it loads on the first render.
export {
  PDF_ELEMENTS,
  PdfCell,
  PdfDocument,
  PdfImage,
  PdfPage,
  PdfPageNumber,
  PdfRow,
  PdfTable,
  PdfText,
  PdfView,
} from './lib/elements';
export type { TableColumn } from './lib/elements';
export type { PageOrientation, PageSize } from './lib/elements/page';
export { PdfRenderer, downloadPdf, renderToBlob } from './lib/render/pdf-renderer';
export { PdfDownload } from './lib/render/pdf-download';
export { providePdfFonts } from './lib/render/pdf-fonts';
export type { PdfFont } from './lib/render/pdf-fonts';
export { pdfResource } from './lib/render/pdf-resource';
export type { PdfResourceOptions, PdfResourceRef } from './lib/render/pdf-resource';
export type {
  DownloadOptions,
  DownloadPdfOptions,
  RenderOptions,
  RenderToBlobOptions,
} from './lib/render/pdf-renderer';
