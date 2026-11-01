import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

/**
 * A link to a URL: a clickable box where a pdf-view can go, or clickable text inside a pdf-text.
 * Only absolute http, https and mailto URLs become links; the engine checks `href`.
 */
@Component({
  selector: 'pdf-link',
  template: '<ng-content />',
})
export class PdfLink {
  readonly href = input.required<string>();

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { href: this.href() };
  }
}
