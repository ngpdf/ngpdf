import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

@Component({
  selector: 'pdf-image',
  template: '<ng-content />',
})
export class PdfImage {
  /** Names this element as a place in the document, for `<pdf-link href="#name">`. */
  readonly anchor = input<string | null | undefined>();
  /** Adds an entry with this title to the document outline, pointing at this element. */
  readonly bookmark = input<string | null | undefined>();
  readonly src = input.required<string | Blob | ArrayBuffer>();

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { src: this.src(), anchor: this.anchor(), bookmark: this.bookmark() };
  }
}
