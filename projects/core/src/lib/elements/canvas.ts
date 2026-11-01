import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfCanvasPaint } from '../tree/canvas-context';
import type { PdfNode } from '../tree/node';

/**
 * Lines and shapes drawn by a function, where a pdf-view can go. It has no content: its size comes
 * from `width` and `height`, or from flex. The engine calls `paint` once per render, after layout.
 */
@Component({
  selector: 'pdf-canvas',
  template: '',
})
export class PdfCanvas {
  readonly paint = input.required<PdfCanvasPaint>();

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { paint: this.paint() };
  }
}
