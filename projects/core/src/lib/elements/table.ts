import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';
import type { TableColumn } from '../tree/table-column';

export type { TableColumn };

@Component({
  selector: 'pdf-table',
  template: '<ng-content />',
})
export class PdfTable {
  /** Names this element as a place in the document, for `<pdf-link href="#name">`. */
  readonly anchor = input<string | null | undefined>();
  /** Adds an entry with this title to the document outline, pointing at this element. */
  readonly bookmark = input<string | null | undefined>();
  readonly columns = input.required<readonly TableColumn[]>();

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { columns: this.columns(), anchor: this.anchor(), bookmark: this.bookmark() };
  }
}
