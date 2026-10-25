import {
  Directive,
  ElementRef,
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
 * A button host is disabled and any host is `aria-busy` while the PDF renders; clicks in between
 * are ignored.
 */
@Directive({
  selector: '[pdfDownload]',
  host: {
    '(click)': 'download()',
    '[attr.aria-busy]': 'busy() ? "true" : null',
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
  private readonly host =
    inject<ElementRef<HTMLElement & { disabled?: boolean }>>(ElementRef).nativeElement;

  protected async download(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    // Set by hand rather than bound, so a host's own `disabled` is never overwritten when idle.
    const disable = this.host.disabled === false;
    if (disable) this.host.disabled = true;
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
      if (disable) this.host.disabled = false;
      this.busy.set(false);
      done();
    }
  }
}
