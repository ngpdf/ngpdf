import { PdfCell } from './cell';
import { PdfDocument } from './document';
import { PdfImage } from './image';
import { PdfLink } from './link';
import { PdfPage } from './page';
import { PdfPageNumber } from './page-number';
import { PdfRow } from './row';
import { PdfSpan } from './span';
import { PdfTable } from './table';
import { PdfText } from './text';
import { PdfView } from './view';

export {
  PdfCell,
  PdfDocument,
  PdfImage,
  PdfLink,
  PdfPage,
  PdfPageNumber,
  PdfRow,
  PdfSpan,
  PdfTable,
  PdfText,
  PdfView,
};
export type { TableColumn } from './table';

/** Every pdf-* element, for `imports: [PDF_ELEMENTS]`. */
export const PDF_ELEMENTS = [
  PdfDocument,
  PdfPage,
  PdfView,
  PdfText,
  PdfSpan,
  PdfLink,
  PdfImage,
  PdfTable,
  PdfRow,
  PdfCell,
  PdfPageNumber,
] as const;
