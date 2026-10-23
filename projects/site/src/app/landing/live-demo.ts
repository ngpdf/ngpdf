import {
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { PdfRenderer } from '@ngpdf/core';
import { InvoiceDocument, makeInvoiceLines } from './invoice-document';

const ACCENTS = [
  { name: 'Vermilion', value: '#c2410c' },
  { name: 'Ink blue', value: '#1d4ed8' },
  { name: 'Forest', value: '#15803d' },
  { name: 'Plum', value: '#7e22ce' },
  { name: 'Graphite', value: '#27272a' },
] as const;

/** Fixed, so the demo invoice reads the same for every visitor. */
const ISSUED_AT = new Date(2026, 9, 23);

/**
 * The home page's playground: the visitor edits the invoice's inputs and ngpdf renders it again in
 * their browser. Nothing renders during the prerender; the first render waits for the browser.
 */
@Component({
  selector: 'site-live-demo',
  templateUrl: './live-demo.html',
  styleUrl: './live-demo.css',
})
export class LiveDemo {
  private readonly pdf = inject(PdfRenderer);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly accents = ACCENTS;
  protected readonly company = signal('Northwind Studio');
  protected readonly customer = signal('Acme Publishing Ltd.');
  protected readonly accent = signal<string>(ACCENTS[0].value);
  protected readonly rows = signal(24);

  protected readonly status = signal<'idle' | 'rendering' | 'ready' | 'error'>('idle');
  protected readonly message = signal('');
  protected readonly elapsed = signal(0);
  private readonly objectUrl = signal<string | undefined>(undefined);
  protected readonly previewUrl = computed<SafeResourceUrl | undefined>(() => {
    const url = this.objectUrl();
    return url
      ? this.sanitizer.bypassSecurityTrustResourceUrl(`${url}#navpanes=0&view=FitH`)
      : undefined;
  });
  protected readonly rawUrl = computed(() => this.objectUrl());

  private readonly started = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by every edit and by teardown; a render whose number is stale drops its result. */
  private generation = 0;

  constructor() {
    afterNextRender(() => {
      this.started.set(true);
    });

    effect(() => {
      const inputs = {
        company: this.company().trim() || 'Your company',
        customer: this.customer().trim() || 'Your customer',
        accent: this.accent(),
        lines: makeInvoiceLines(this.rows()),
        issuedAt: ISSUED_AT,
      };
      if (!this.started()) return;
      untracked(() => {
        this.schedule(inputs);
      });
    });

    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      clearTimeout(this.timer);
      const url = this.objectUrl();
      if (url) URL.revokeObjectURL(url);
    });
  }

  protected setText(target: 'company' | 'customer', event: Event): void {
    const value = (event.target as HTMLInputElement).value.slice(0, 60);
    this[target].set(value);
  }

  protected setRows(event: Event): void {
    this.rows.set(Number((event.target as HTMLInputElement).value));
  }

  private schedule(inputs: Record<string, unknown>): void {
    // A render still running for the previous inputs must not publish once these are edited.
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.render(inputs, generation), 250);
  }

  private async render(inputs: Record<string, unknown>, generation: number): Promise<void> {
    this.status.set('rendering');
    const started = performance.now();
    try {
      const blob = await this.pdf.toBlob(InvoiceDocument, { inputs });
      // A newer edit, or leaving the page, happened while this one rendered.
      if (generation !== this.generation) return;
      const previous = this.objectUrl();
      this.objectUrl.set(URL.createObjectURL(blob));
      if (previous) URL.revokeObjectURL(previous);
      this.elapsed.set(Math.round(performance.now() - started));
      this.message.set(`${(blob.size / 1024).toFixed(1)} KB`);
      this.status.set('ready');
    } catch (error) {
      if (generation !== this.generation) return;
      this.message.set(error instanceof Error ? error.message : 'Could not render the PDF.');
      this.status.set('error');
    }
  }
}
