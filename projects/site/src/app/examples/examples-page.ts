import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PdfRenderer } from '@ngpdf/core';
// The demo app's documents, used as they are, so the site shows exactly what the repository tests.
import { captureChart } from '../../../../demo/src/app/capture-chart';
import { CHART_BARS, makeCommunicators, makeLicences } from '../../../../demo/src/app/data';
import { CaptureReport } from '../../../../demo/src/app/documents/capture-report';
import { CommunicatorsList } from '../../../../demo/src/app/documents/communicators-list';
import { LicencesList } from '../../../../demo/src/app/documents/licences-list';
import { InvoiceDocument, makeInvoiceLines } from '../landing/invoice-document';
import { Seo } from '../seo';
import { GITHUB_URL, SITE_NAME } from '../site';

type ExampleId = 'invoice' | 'communicators' | 'licences' | 'capture';

interface Example {
  readonly id: ExampleId;
  readonly title: string;
  readonly text: string;
  readonly points: readonly string[];
  readonly source: string;
}

const DEMO_SOURCE = `${GITHUB_URL}/blob/main/projects/demo/src/app/documents`;

const EXAMPLES: readonly Example[] = [
  {
    id: 'invoice',
    title: 'Invoice',
    text: 'The home page playground: a header in two columns, a billing box, a table of line items and a total.',
    points: ['Row and column flexbox', 'Currency and date pipes', 'Repeating header row'],
    source: `${GITHUB_URL}/blob/main/projects/site/src/app/landing/invoice-document.ts`,
  },
  {
    id: 'communicators',
    title: 'Paginated directory',
    text: 'A list of 140 people across several A4 pages, with zebra rows, a red header that repeats on every page and "Page n of N" at the bottom.',
    points: ['140 rows, never split', 'Header on every page', 'Page numbers'],
    source: `${DEMO_SOURCE}/communicators-list.ts`,
  },
  {
    id: 'licences',
    title: 'Landscape licence list',
    text: 'Sixty licences on landscape A4 with seven columns mixing fixed widths and fr shares, dates and amounts in Brazilian real.',
    points: ['Landscape pages', 'Fixed and fr columns', 'Right-aligned amounts'],
    source: `${DEMO_SOURCE}/licences-list.ts`,
  },
  {
    id: 'capture',
    title: 'Capture report',
    text: 'The chart below, drawn onto a canvas and placed in a landscape page with a title and a timestamp, scaled to fit.',
    points: ['Image from a Blob', 'object-fit: contain', 'Document metadata'],
    source: `${DEMO_SOURCE}/capture-report.ts`,
  },
];

/** Fixed so the example documents read the same for every visitor. */
const FIXED_DATE = new Date(2026, 9, 23, 14, 30);

@Component({
  selector: 'site-examples-page',
  imports: [RouterLink],
  templateUrl: './examples-page.html',
  styleUrl: './examples-page.css',
})
export class ExamplesPage {
  private readonly pdf = inject(PdfRenderer);
  private readonly chart = viewChild.required<ElementRef<HTMLElement>>('chart');

  protected readonly examples = EXAMPLES;
  protected readonly bars = CHART_BARS;
  protected readonly chartLabel = `Bar chart of monthly captures: ${CHART_BARS.map((bar) => `${bar.label} ${String(bar.value)}`).join(', ')}`;
  protected readonly busy = signal<ExampleId | undefined>(undefined);
  protected readonly status = signal('');
  /**
   * Each open preview tab and its URL. A tab keeps using its URL (a reload reads it again), so the
   * URL is revoked when the tab closes, or when the visitor leaves this page.
   */
  private readonly previews = new Map<Window, string>();
  private previewWatch: ReturnType<typeof setInterval> | undefined;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearInterval(this.previewWatch);
      for (const url of this.previews.values()) URL.revokeObjectURL(url);
      this.previews.clear();
    });
    inject(Seo).apply({
      title: `Examples - ${SITE_NAME}`,
      description:
        'Complete ngpdf documents you can generate in your browser: an invoice, a paginated directory with repeating headers, a landscape table and a chart capture.',
      path: '/examples',
    });
  }

  protected async open(id: ExampleId, mode: 'preview' | 'download'): Promise<void> {
    // Open the tab inside the click, before the await, or the browser treats it as a pop-up.
    const preview = mode === 'preview' ? window.open('', '_blank') : null;
    this.busy.set(id);
    this.status.set('');
    const started = performance.now();
    try {
      const blob = await this.render(id);
      // The visitor left while it rendered: nothing would ever revoke a URL made now.
      if (this.destroyed) {
        preview?.close();
        return;
      }
      const url = URL.createObjectURL(blob);
      if (preview) {
        this.watchPreview(preview, url);
        preview.location.href = url;
      } else {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `ngpdf-${id}.pdf`;
        anchor.click();
        // The download has started from the URL; some browsers cancel it if revoked in the same tick.
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 0);
      }
      this.status.set(
        `${id} rendered in ${String(Math.round(performance.now() - started))} ms in your browser.`,
      );
    } catch (error) {
      preview?.close();
      this.status.set(error instanceof Error ? error.message : 'Could not render the PDF.');
    } finally {
      this.busy.set(undefined);
    }
  }

  private watchPreview(tab: Window, url: string): void {
    this.previews.set(tab, url);
    this.previewWatch ??= setInterval(() => {
      for (const [open, openUrl] of this.previews) {
        if (!open.closed) continue;
        URL.revokeObjectURL(openUrl);
        this.previews.delete(open);
      }
      if (this.previews.size === 0) {
        clearInterval(this.previewWatch);
        this.previewWatch = undefined;
      }
    }, 2000);
  }

  private async render(id: ExampleId): Promise<Blob> {
    switch (id) {
      case 'invoice':
        return this.pdf.toBlob(InvoiceDocument, {
          inputs: {
            company: 'Northwind Studio',
            customer: 'Acme Publishing Ltd.',
            accent: '#c2410c',
            lines: makeInvoiceLines(40),
            issuedAt: FIXED_DATE,
          },
        });
      case 'communicators':
        return this.pdf.toBlob(CommunicatorsList, { inputs: { items: makeCommunicators(140) } });
      case 'licences':
        return this.pdf.toBlob(LicencesList, { inputs: { items: makeLicences(60) } });
      case 'capture':
        return this.pdf.toBlob(CaptureReport, {
          inputs: {
            title: 'Relatório de captura',
            capturedAt: FIXED_DATE,
            image: await captureChart(this.chart().nativeElement),
          },
        });
    }
  }
}
