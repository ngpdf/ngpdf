import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

/**
 * An SVG drawing, where a `pdf-image` can go. `src` is SVG markup, a `data:image/svg+xml` URL, an
 * http(s) URL or a `Blob`; the engine parses it and draws it as vector shapes.
 */
@Component({
  selector: 'pdf-svg',
  template: '',
})
export class PdfSvg {
  /** Names this element as a place in the document, for `<pdf-link href="#name">`. */
  readonly anchor = input<string | null | undefined>();
  /** Adds an entry with this title to the document outline, pointing at this element. */
  readonly bookmark = input<string | null | undefined>();
  readonly src = input.required<string | Blob>();

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { src: this.src(), anchor: this.anchor(), bookmark: this.bookmark() };
  }
}
