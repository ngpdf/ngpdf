import { Component, ElementRef, inject, input, numberAttribute } from '@angular/core';
import type { PdfNode } from '../tree/node';

type UpTo4 = 0 | 1 | 2 | 3 | 4;
type UpTo10 = UpTo4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * A named paper size or `[width, height]` in points. Names are listed in their canonical
 * spelling; at run time they match in any case.
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
  | readonly [number, number];
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
