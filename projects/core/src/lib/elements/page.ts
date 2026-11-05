import { Component, ElementRef, inject, input, numberAttribute } from '@angular/core';
import type { PdfNode } from '../tree/node';

type UpTo4 = 0 | 1 | 2 | 3 | 4;
type UpTo10 = UpTo4 | 5 | 6 | 7 | 8 | 9 | 10;

/** A length string in the units styles take, other than `%`: `'210mm'`, `'4in'`, `'400'`. */
type PageLengthString = `${number}` | `${number}${'pt' | 'px' | 'in' | 'cm' | 'mm'}`;

/**
 * A named paper size, `[width, height]` (each a number of points or a length string), one number
 * or length for a square page, or the CSS `@page` string of two lengths (`'210mm 297mm'`). The
 * height may be `'auto'` (`[226, 'auto']`, `'80mm auto'`): each sheet is as tall as its content,
 * up to 14400pt. Names, units and `auto` are listed in their canonical spelling; at run time they
 * match in any case.
 */
export type PageSize =
  | `${'A' | 'B' | 'C' | 'JIS-B'}${UpTo10}`
  | `${'RA' | 'SRA'}${UpTo4}`
  | '2A0'
  | '4A0'
  | 'Letter'
  | 'Legal'
  | 'Executive'
  | 'Folio'
  | 'Tabloid'
  | 'Ledger'
  | 'ID1'
  | number
  | PageLengthString
  | `${PageLengthString} ${PageLengthString | 'auto'}`
  | readonly [number | PageLengthString, number | PageLengthString | 'auto'];
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
