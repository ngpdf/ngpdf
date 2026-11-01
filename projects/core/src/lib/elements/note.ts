import { Component, ElementRef, booleanAttribute, inject, input } from '@angular/core';
import type { NoteIcon } from '../tree/note-icon';
import type { PdfNode } from '../tree/node';

export type { NoteIcon };

/**
 * A comment on the page, shown by PDF viewers as an icon that opens a popup with its text. It takes
 * no space in the layout and is not printed. Its content is the note's text.
 */
@Component({
  selector: 'pdf-note',
  template: '<ng-content />',
})
export class PdfNote {
  /** Shown as the note's title. A data-bound value may be missing: the note then has none. */
  readonly author = input<string | null | undefined>();
  readonly icon = input<NoteIcon>('comment');
  /** Shows the popup when the file opens. */
  readonly open = input(false, { transform: booleanAttribute });

  constructor() {
    (inject(ElementRef).nativeElement as PdfNode).owner = this;
  }

  pdfProps(): Record<string, unknown> {
    return { author: this.author(), icon: this.icon(), open: this.open() };
  }
}
