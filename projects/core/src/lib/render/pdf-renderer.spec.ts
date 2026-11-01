// @vitest-environment jsdom
import {
  Component,
  DestroyRef,
  EnvironmentInjector,
  PLATFORM_ID,
  createEnvironmentInjector,
  inject,
  input,
  provideZoneChangeDetection,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_ELEMENTS } from '../elements';
import { PdfRenderer, downloadPdf, renderToBlob } from './pdf-renderer';

const engineState = vi.hoisted(() => ({ failNext: false, loads: 0 }));

// The real engine, except that PDFs are written uncompressed so their text is readable.
vi.mock('../engine', async (importOriginal) => {
  engineState.loads++;
  if (engineState.failNext) {
    engineState.failNext = false;
    throw new Error('chunk failed to load');
  }
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

const destroyed: string[] = [];

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

  constructor() {
    inject(DestroyRef).onDestroy(() => destroyed.push('document'));
  }
}

@Component({
  selector: 'pdf-bare-text-document',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page>
        <pdf-table [columns]="['1fr']">
          <pdf-row>
            <pdf-cell>{{ cell() }}</pdf-cell>
          </pdf-row>
        </pdf-table>
        <pdf-view>a<pdf-text>b</pdf-text>c</pdf-view>
      </pdf-page>
    </pdf-document>
  `,
})
class BareTextDocument {
  readonly cell = input('');
}

@Component({
  selector: 'pdf-no-document',
  imports: [PDF_ELEMENTS],
  template: '<pdf-page />',
})
class NoDocument {
  constructor() {
    inject(DestroyRef).onDestroy(() => destroyed.push('no-document'));
  }
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

beforeEach(() => {
  destroyed.length = 0;
  engineState.failNext = false;
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PdfRenderer', () => {
  it('renders a component with inputs to a PDF that holds the text', async () => {
    const blob = await TestBed.inject(PdfRenderer).toBlob(TestDocument, {
      inputs: { rows: ['Alpha row', 'Beta row'] },
    });
    expect(blob.type).toBe('application/pdf');
    expect(await shownText(blob)).toEqual(['Alpha row', 'Beta row']);
  });

  it('draws bare text in elements other than pdf-text as anonymous text boxes', async () => {
    const blob = await TestBed.inject(PdfRenderer).toBlob(BareTextDocument, {
      inputs: { cell: 'In a cell' },
    });
    expect(await shownText(blob)).toEqual(['In a cell', 'a', 'b', 'c']);
  });

  it('renders without inputs', async () => {
    const blob = await TestBed.inject(PdfRenderer).toBlob(TestDocument);
    expect(await shownText(blob)).toEqual([]);
    expect(await blob.slice(0, 5).text()).toBe('%PDF-');
  });

  it('works when the parent injector provides zone change detection', async () => {
    await import('zone.js');
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection()] });
    const blob = await TestBed.inject(PdfRenderer).toBlob(TestDocument, {
      inputs: { rows: ['Zoned row'] },
    });
    expect(await shownText(blob)).toEqual(['Zoned row']);
  });

  it('keeps two renders started together apart', async () => {
    const renderer = TestBed.inject(PdfRenderer);
    const [first, second] = await Promise.all([
      renderer.toBlob(TestDocument, { inputs: { rows: ['only-first-1', 'only-first-2'] } }),
      renderer.toBlob(TestDocument, { inputs: { rows: ['only-second-1'] } }),
    ]);
    expect(await shownText(first)).toEqual(['only-first-1', 'only-first-2']);
    expect(await shownText(second)).toEqual(['only-second-1']);
  });

  it('destroys the document component after the render', async () => {
    await TestBed.inject(PdfRenderer).toBlob(TestDocument, { inputs: { rows: ['x'] } });
    expect(destroyed).toEqual(['document']);
  });

  it('destroys the component and rejects when the engine fails', async () => {
    await expect(TestBed.inject(PdfRenderer).toBlob(NoDocument)).rejects.toThrow(
      'ngpdf: no pdf-document',
    );
    expect(destroyed).toEqual(['no-document']);
  });
});

describe('renderToBlob', () => {
  it('takes an explicit injector and works outside an injection context', async () => {
    const injector = TestBed.inject(EnvironmentInjector);
    const blob = await renderToBlob(TestDocument, { injector, inputs: { rows: ['Explicit'] } });
    expect(await shownText(blob)).toEqual(['Explicit']);
  });
});

describe('download', () => {
  function stubUrls(url = 'blob:ngpdf-test'): {
    create: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  } {
    const create = vi.fn(() => url);
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    return { create, revoke };
  }

  it('clicks an anchor named after the file, then revokes the URL on a later tick', async () => {
    const { create, revoke } = stubUrls();
    const clicked: { download: string; href: string; connected: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href, connected: this.isConnected });
    });

    vi.useFakeTimers();
    await TestBed.inject(PdfRenderer).download(TestDocument, {
      fileName: 'report.pdf',
      inputs: { rows: ['Downloaded'] },
    });

    expect(create).toHaveBeenCalledOnce();
    expect((create.mock.calls[0] as unknown as [Blob])[0]).toBeInstanceOf(Blob);
    expect(clicked).toEqual([{ download: 'report.pdf', href: 'blob:ngpdf-test', connected: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:ngpdf-test');
  });

  it('downloadPdf works with an explicit injector', async () => {
    stubUrls();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(vi.fn());
    await downloadPdf(TestDocument, {
      injector: TestBed.inject(EnvironmentInjector),
      fileName: 'a.pdf',
    });
    expect(click).toHaveBeenCalledOnce();
  });

  it('removes the anchor and revokes the URL when click throws', async () => {
    // Its own URL: a revoke that an earlier test left on a timer also lands on this stub.
    const { revoke } = stubUrls('blob:ngpdf-blocked');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('click blocked');
    });
    vi.useFakeTimers();
    try {
      await expect(
        TestBed.inject(PdfRenderer).download(TestDocument, { fileName: 'blocked.pdf' }),
      ).rejects.toThrow('click blocked');
      expect(document.querySelector('a[download]')).toBeNull();
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith('blob:ngpdf-blocked');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects under a server platform before rendering anything', async () => {
    const injector = createEnvironmentInjector(
      [{ provide: PLATFORM_ID, useValue: 'server' }],
      TestBed.inject(EnvironmentInjector),
    );
    await expect(downloadPdf(TestDocument, { injector, fileName: 'a.pdf' })).rejects.toThrow(
      'ngpdf: downloadPdf needs a browser; on the server, use renderToBuffer from @ngpdf/core/server',
    );
    expect(destroyed).toEqual([]);
  });

  it('does not click when the render fails', async () => {
    const { create } = stubUrls();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(vi.fn());
    await expect(
      TestBed.inject(PdfRenderer).download(NoDocument, { fileName: 'x.pdf' }),
    ).rejects.toThrow('ngpdf:');
    expect(create).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});

describe('injection', () => {
  it('is a root singleton usable from an injection context', () => {
    const renderer = TestBed.inject(PdfRenderer);
    const again = TestBed.runInInjectionContext(() => inject(PdfRenderer));
    expect(again).toBe(renderer);
  });
});
