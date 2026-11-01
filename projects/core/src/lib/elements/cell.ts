import { Component, ElementRef, inject, input, numberAttribute } from '@angular/core';
import type { PdfNode } from '../tree/node';

@Component({
  selector: 'pdf-cell',
  template: '<ng-content />',
})
export class PdfCell {
  /** Names this element as a place in the document, for `<pdf-link href="#name">`. */
  readonly anchor = input<string | null | undefined>();
  /** Adds an entry with this title to the document outline, pointing at this element. */
  readonly bookmark = input<string | null | undefined>();
  readonly span = input(1, { transform: numberAttribute });

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { span: this.span(), anchor: this.anchor(), bookmark: this.bookmark() };
  }
}
