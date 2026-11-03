import type { PdfNode } from './node';

/** What a `pdfPerSheet` template gets on each sheet. Numbers are 1-based. */
export interface PdfPerSheetContext {
  /** The sheet number, as `let-sheet`. */
  readonly $implicit: number;
  readonly sheet: number;
  /** The number of sheets in the document. */
  readonly total: number;
  readonly first: boolean;
  readonly last: boolean;
  /** The `pdf-page` the sheet comes from, counted in template order. */
  readonly page: number;
}

/**
 * Renders the `pdfPerSheet` template whose anchor is `slot` with `context`, and returns a node
 * whose children are the template's nodes. The engine calls it back from its lazy half, so it is
 * a plain function: the engine never sees Angular.
 */
export type RenderPerSheet = (slot: PdfNode, context: PdfPerSheetContext) => PdfNode;
