import { Component, ElementRef, inject, input, numberAttribute } from '@angular/core';
import type { PdfNode } from '../tree/node';

/** A length string in the units styles take, other than `%`: `'210mm'`, `'4in'`, `'400'`. */
type PageLengthString = `${number}` | `${number}${'pt' | 'px' | 'in' | 'cm' | 'mm'}`;

/**
 * A named size, `[width, height]` (each a number of points or a length string), one number or
 * length for a square page, or the CSS `@page` string of two lengths (`'210mm 297mm'`).
 */
export type PageSize =
  | 'A3'
  | 'A4'
  | 'A5'
  | 'Letter'
  | 'Legal'
  | number
  | PageLengthString
  | `${PageLengthString} ${PageLengthString}`
  | readonly [number | PageLengthString, number | PageLengthString];
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
