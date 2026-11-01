import { Component, ElementRef, inject, isDevMode, signal, viewChild } from '@angular/core';
import { PdfRenderer } from '@ngpdf/core';
import { captureChart } from './capture-chart';
import { CHART_BARS, makeCommunicators, makeLicences } from './data';
import { ArticleSample } from './documents/article-sample';
import { CaptureReport } from './documents/capture-report';
import { CommunicatorsList } from './documents/communicators-list';
import { ContentsSample } from './documents/contents-sample';
import { FixedSample } from './documents/fixed-sample';
import { FontsSample } from './documents/fonts-sample';
import { LicencesList } from './documents/licences-list';
import { SecureSample } from './documents/secure-sample';
import { SpanSample } from './documents/span-sample';
import { Preview } from './preview';

const DOCUMENT_NAMES = [
  'capture-report',
  'communicators-list',
  'licences-list',
  'fonts-sample',
  'span-sample',
  'article-sample',
  'fixed-sample',
  'fixed-debug',
  'contents-sample',
  'secure-sample',
] as const;
export type DemoDocument = (typeof DOCUMENT_NAMES)[number];

function isDemoDocument(name: string): name is DemoDocument {
  return (DOCUMENT_NAMES as readonly string[]).includes(name);
}

/** Made up for the demo. In an app, the password comes from the user or the server. */
const DEMO_PASSWORD = 'demo-1234';

/** Fixed so the end-to-end text does not depend on the day it runs. */
const CAPTURED_AT = new Date(2026, 9, 22, 14, 30);

declare global {
  interface Window {
    ngpdfDemo?: { render(name: string): Promise<string> };
  }
}

function toBase64(bytes: ArrayBuffer): string {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

@Component({
  selector: 'app-root',
  imports: [Preview],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly pdf = inject(PdfRenderer);
  private readonly chart = viewChild.required<ElementRef<HTMLElement>>('chart');

  protected readonly bars = CHART_BARS;
  protected readonly status = signal('Ready.');

  constructor() {
    if (isDevMode()) {
      // The end-to-end script drives the demo through this hook; production builds do not have it.
      window.ngpdfDemo = {
        render: async (name) => {
          if (!isDemoDocument(name)) {
            throw new Error(`Unknown demo document "${name}"; use ${DOCUMENT_NAMES.join(', ')}`);
          }
          return toBase64(await (await this.blobOf(name)).arrayBuffer());
        },
      };
    }
  }

  protected async download(name: DemoDocument): Promise<void> {
    this.status.set(`Generating ${name}...`);
    try {
      const started = performance.now();
      const blob = await this.blobOf(name);
      this.save(blob, `${name}.pdf`);
      this.status.set(
        `${name}.pdf ready in ${String(Math.round(performance.now() - started))} ms.`,
      );
    } catch (error) {
      this.status.set(error instanceof Error ? error.message : 'Could not generate the PDF.');
    }
  }

  private async blobOf(name: DemoDocument): Promise<Blob> {
    switch (name) {
      case 'capture-report':
        return this.pdf.toBlob(CaptureReport, {
          inputs: {
            title: 'Relatório de captura',
            capturedAt: CAPTURED_AT,
            image: await captureChart(this.chart().nativeElement),
          },
        });
      case 'communicators-list':
        return this.pdf.toBlob(CommunicatorsList, { inputs: { items: makeCommunicators(140) } });
      case 'licences-list':
        return this.pdf.toBlob(LicencesList, { inputs: { items: makeLicences(60) } });
      case 'fonts-sample':
        return this.pdf.toBlob(FontsSample);
      case 'span-sample':
        return this.pdf.toBlob(SpanSample);
      case 'article-sample':
        return this.pdf.toBlob(ArticleSample);
      case 'fixed-sample':
        return this.pdf.toBlob(FixedSample);
      case 'fixed-debug':
        return this.pdf.toBlob(FixedSample, { inputs: { debug: true } });
      case 'contents-sample':
        return this.pdf.toBlob(ContentsSample);
      case 'secure-sample':
        return this.pdf.toBlob(SecureSample, { inputs: { password: DEMO_PASSWORD } });
    }
  }

  private save(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }
}
