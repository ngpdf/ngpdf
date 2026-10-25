import {
  Directive,
  EnvironmentInjector,
  ErrorHandler,
  PendingTasks,
  inject,
  input,
  output,
  signal,
  type Type,
} from '@angular/core';
import { downloadPdf } from './pdf-renderer';

/**
 * Downloads a document when its host is clicked:
 * `<button [pdfDownload]="Invoice" [pdfInputs]="{ lines }" pdfFileName="invoice.pdf">`.
 * While the PDF renders the host is `aria-busy` and `aria-disabled`, and clicks are ignored. It is
 * not given `disabled`: that would drop keyboard focus and fight the app's own `[disabled]`.
 */
@Directive({
  selector: '[pdfDownload]',
  host: {
    '(click)': 'download($event)',
    '[attr.aria-busy]': 'busy() ? "true" : null',
    '[attr.aria-disabled]': 'busy() ? "true" : null',
  },
})
export class PdfDownload {
  readonly pdfDownload = input.required<Type<unknown>>();
  readonly pdfInputs = input<Record<string, unknown>>({});
  readonly pdfFileName = input.required<string>();
  /** The render's error. It also goes to the app's `ErrorHandler`. */
  readonly pdfError = output<unknown>();

  protected readonly busy = signal(false);
  private readonly injector = inject(EnvironmentInjector);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly pendingTasks = inject(PendingTasks);

  protected async download(event: Event): Promise<void> {
    // aria-disabled stops nothing by itself: a busy click must not submit a form or follow a link.
    if (this.busy()) {
      event.preventDefault();
      return;
    }
    this.busy.set(true);
    const done = this.pendingTasks.add();
    try {
      await downloadPdf(this.pdfDownload(), {
        inputs: this.pdfInputs(),
        fileName: this.pdfFileName(),
        injector: this.injector,
      });
    } catch (error: unknown) {
      this.errorHandler.handleError(error);
      this.pdfError.emit(error);
    } finally {
      this.busy.set(false);
      done();
    }
  }
}
