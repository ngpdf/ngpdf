import {
  Component,
  Injector,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  type Type,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { pdfResource, type PdfResourceRef } from '@ngpdf/core';

type ViewerState = 'loading' | 'error' | 'shown';

/**
 * Shows a document as a PDF in the browser's own PDF viewer, and renders it again when its
 * inputs change: `<pdf-viewer [document]="Invoice" [inputs]="{ invoice }" />`. Content with the
 * `pdfViewerLoading` attribute shows until the first PDF is there, and content with
 * `pdfViewerError` shows when a render fails.
 */
@Component({
  selector: 'pdf-viewer',
  // No `sandbox` on the iframe: Chrome blocks its PDF viewer in a sandboxed frame whatever the
  // allow-* tokens ("This page has been blocked by Chrome"), checked in Chrome 156. The frame
  // only ever loads a same-origin blob: URL of a PDF that ngpdf wrote, with no JavaScript in it.
  template: `
    @if (src(); as src) {
      <iframe [src]="src" [title]="label()"></iframe>
    }
    <div [hidden]="state() !== 'loading'"><ng-content select="[pdfViewerLoading]" /></div>
    <div [hidden]="state() !== 'error'"><ng-content select="[pdfViewerError]" /></div>
  `,
  styles: `
    :host {
      display: block;
    }
    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
  `,
})
export class PdfViewer {
  /** The document component to show. */
  readonly document = input.required<Type<unknown>>();
  /** The document's inputs, by input name, as in `renderToBlob`. A new object renders again. */
  readonly inputs = input<Record<string, unknown>>({});
  /** Milliseconds to wait after the last change before rendering, the first render included. */
  readonly debounce = input(300);
  /** The iframe's accessible name. */
  readonly label = input('PDF preview');
  /** The PDF of each render that is shown. */
  readonly rendered = output<Blob>();
  /** The error of a render that failed. */
  readonly failed = output<unknown>();

  private readonly injector = inject(Injector);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly pdf = signal<PdfResourceRef | undefined>(undefined);

  protected readonly src = computed<SafeResourceUrl | undefined>(() => {
    const url = this.pdf()?.url();
    // pdfResource makes blob: URLs only; nothing else is ever trusted as a frame source.
    return url?.startsWith('blob:')
      ? this.sanitizer.bypassSecurityTrustResourceUrl(url)
      : undefined;
  });

  protected readonly state = computed<ViewerState>(() => {
    if (this.pdf()?.status() === 'error') return 'error';
    return this.src() ? 'shown' : 'loading';
  });

  constructor() {
    // A new document or debounce needs a new resource; new inputs reach the current one.
    effect((onCleanup) => {
      const document = this.document();
      const debounce = this.debounce();
      const pdf = untracked(() =>
        pdfResource(document, { inputs: () => this.inputs(), debounce, injector: this.injector }),
      );
      this.pdf.set(pdf);
      onCleanup(() => {
        pdf.destroy();
      });
    });

    effect(() => {
      const pdf = this.pdf();
      if (!pdf) return;
      if (pdf.status() === 'error') {
        const error = pdf.error();
        untracked(() => {
          this.failed.emit(error);
        });
      } else {
        // value() throws only in the error status, handled above.
        const blob = pdf.value();
        if (!blob) return;
        untracked(() => {
          this.rendered.emit(blob);
        });
      }
    });
  }
}
