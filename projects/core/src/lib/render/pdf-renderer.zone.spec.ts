// @vitest-environment jsdom
// zone.js patches Promise and the timers for good once loaded, so it gets a file of its own:
// Vitest runs each spec file in a fresh environment, and the other specs stay zoneless.
import 'zone.js';
import { Component, input, provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PDF_ELEMENTS } from '../elements';
import { PdfRenderer } from './pdf-renderer';

// The real engine, with PDFs written uncompressed so their text is readable.
vi.mock('../engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine')>();
  const { createPdfkitWriter } = await import('../engine/writer');
  return {
    ...actual,
    renderDocument: async (root: Parameters<typeof actual.renderDocument>[0]) =>
      actual.renderDocument(root, {
        dev: false,
        writer: await createPdfkitWriter({ compress: false }),
      }),
  };
});

@Component({
  selector: 'pdf-test-document',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page>
        @for (row of rows(); track $index) {
          <pdf-text>{{ row }}</pdf-text>
        }
      </pdf-page>
    </pdf-document>
  `,
})
class TestDocument {
  readonly rows = input<string[]>([]);
}

/** The strings the PDF shows: each `[<hex> kern <hex>] TJ` line joined and decoded. */
async function shownText(blob: Blob): Promise<string[]> {
  const pdf = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
  return pdf
    .split('\n')
    .filter((line) => line.startsWith('[') && line.endsWith('] TJ'))
    .map((line) =>
      [...line.matchAll(/<([0-9a-f]+)>/g)]
        .map((hex) =>
          String.fromCharCode(...(hex[1]!.match(/../g) ?? []).map((h) => parseInt(h, 16))),
        )
        .join(''),
    );
}

describe('PdfRenderer under zone.js', () => {
  it('works when the parent injector provides zone change detection', async () => {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection()] });
    const blob = await TestBed.inject(PdfRenderer).toBlob(TestDocument, {
      inputs: { rows: ['Zoned row'] },
    });
    expect(await shownText(blob)).toEqual(['Zoned row']);
  });
});
