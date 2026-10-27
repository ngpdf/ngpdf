import { Component, ElementRef, inject } from '@angular/core';
import type { PdfNode } from '../tree/node';

/** Part of a pdf-text drawn in its own text styles, such as one bold word in a sentence. */
@Component({
  selector: 'pdf-span',
  template: '<ng-content />',
})
export class PdfSpan {
  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return {};
  }
}
