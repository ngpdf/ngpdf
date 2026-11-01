import { Component, signal } from '@angular/core';
import { PdfDownload } from '@ngpdf/core';
import { PdfViewer } from '@ngpdf/core/viewer';
import { PreviewNote } from './documents/preview-note';

/**
 * A live preview with `pdf-viewer`, loaded in a deferred chunk. A browser without an inline PDF
 * viewer still gets the download button.
 */
@Component({
  selector: 'app-preview',
  imports: [PdfViewer, PdfDownload],
  template: `
    <label>
      Title
      <input type="text" [value]="title()" (input)="setTitle($event)" />
    </label>
    <pdf-viewer
      class="viewer"
      [document]="note"
      [inputs]="{ title: title() }"
      label="Preview of the note"
    >
      <p pdfViewerLoading>Rendering the preview…</p>
      <p pdfViewerError>The preview could not be shown.</p>
    </pdf-viewer>
    <button
      type="button"
      [pdfDownload]="note"
      [pdfInputs]="{ title: title() }"
      pdfFileName="note.pdf"
    >
      Download the note
    </button>
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.5rem;
    }
    .viewer {
      height: 28rem;
      border: 1px solid #cccccc;
    }
  `,
})
export class Preview {
  protected readonly note = PreviewNote;
  protected readonly title = signal('Weekly note');

  protected setTitle(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
  }
}
