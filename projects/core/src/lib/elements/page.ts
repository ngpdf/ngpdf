import { Component, ElementRef, inject, input, numberAttribute } from '@angular/core';
import type { PdfNode } from '../tree/node';

export type PageSize = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | readonly [number, number];
export type PageOrientation = 'portrait' | 'landscape';

@Component({
  selector: 'pdf-page',
  template: '<ng-content />',
})
export class PdfPage {
  readonly size = input<PageSize>('A4');
  readonly orientation = input<PageOrientation>('portrait');
  /**
   * The resolution images on this page are printed at: an image with no width or height set
   * takes 72 / dpi points per pixel. Styles keep 1px = 1pt.
   */
  readonly dpi = input(72, { transform: numberAttribute });

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { size: this.size(), orientation: this.orientation(), dpi: this.dpi() };
  }
}
