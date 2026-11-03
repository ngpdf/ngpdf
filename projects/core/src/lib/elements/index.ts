import { PdfCanvas } from './canvas';
import { PdfCell } from './cell';
import { PdfDocument } from './document';
import { PdfImage } from './image';
import { PdfLink } from './link';
import { PdfNote } from './note';
import { PdfPage } from './page';
import { PdfPageNumber } from './page-number';
import { PdfPerSheet } from './per-sheet';
import { PdfRow } from './row';
import { PdfSpan } from './span';
import { PdfTable } from './table';
import { PdfText } from './text';
import { PdfView } from './view';

export {
  PdfCanvas,
  PdfCell,
  PdfDocument,
  PdfImage,
  PdfLink,
  PdfNote,
  PdfPage,
  PdfPageNumber,
  PdfPerSheet,
  PdfRow,
  PdfSpan,
  PdfTable,
  PdfText,
  PdfView,
};
export type { NoteIcon } from './note';
export type { TableColumn } from './table';
export type { PdfPerSheetContext } from '../tree/per-sheet';

/** Every pdf-* element and the `pdfPerSheet` directive, for `imports: [PDF_ELEMENTS]`. */
export const PDF_ELEMENTS = [
  PdfDocument,
  PdfPage,
  PdfView,
  PdfText,
  PdfSpan,
  PdfLink,
  PdfNote,
  PdfImage,
  PdfTable,
  PdfRow,
  PdfCell,
  PdfPageNumber,
  PdfCanvas,
  PdfPerSheet,
] as const;
