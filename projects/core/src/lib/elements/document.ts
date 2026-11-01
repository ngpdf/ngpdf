import { Component, ElementRef, inject, input } from '@angular/core';
import type { PdfNode } from '../tree/node';

import type { PdfSecurity } from '../tree/security';
import type { PageLayout, PageMode } from '../tree/viewer-preferences';

export type { PageLayout, PageMode, PdfSecurity };

@Component({
  selector: 'pdf-document',
  template: '<ng-content />',
})
export class PdfDocument {
  readonly title = input<string>();
  readonly author = input<string>();
  readonly subject = input<string>();
  readonly keywords = input<readonly string[]>();
  readonly creationDate = input<Date>();
  readonly language = input<string>();
  readonly creator = input<string>();
  readonly producer = input<string>();
  readonly pageMode = input<PageMode>();
  readonly pageLayout = input<PageLayout>();
  /** Encrypts the file with AES-256 and sets what a viewer lets the reader do. */
  readonly security = input<PdfSecurity>();

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return {
      title: this.title(),
      author: this.author(),
      subject: this.subject(),
      keywords: this.keywords(),
      creationDate: this.creationDate(),
      language: this.language(),
      creator: this.creator(),
      producer: this.producer(),
      pageMode: this.pageMode(),
      pageLayout: this.pageLayout(),
      security: this.security(),
    };
  }
}
