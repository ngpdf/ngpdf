import { Component, ElementRef, booleanAttribute, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

@Component({
  selector: 'pdf-view',
  template: '<ng-content />',
})
export class PdfView {
  readonly breakBefore = input(false, { transform: booleanAttribute });
  readonly breakAfter = input(false, { transform: booleanAttribute });
  /** Draws this view on every sheet of its pdf-page, at the top or the bottom. */
  readonly fixed = input<'top' | 'bottom'>();

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { breakBefore: this.breakBefore(), breakAfter: this.breakAfter(), fixed: this.fixed() };
  }
}
