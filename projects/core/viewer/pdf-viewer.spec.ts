// @vitest-environment jsdom
import { ApplicationRef, Component, signal, type Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomSanitizer } from '@angular/platform-browser';
import { PdfViewer } from './pdf-viewer';

interface Render {
  readonly component: unknown;
  readonly inputs: Record<string, unknown> | undefined;
  resolve(): void;
  reject(error: Error): void;
}

const renders = vi.hoisted(() => ({ calls: [] as Render[], manual: false }));

// A stub renderer: the viewer is plumbing around pdfResource and renderToBlob, which have their
// own specs. With `manual` set, each render waits until the test settles it.
vi.mock('../src/lib/render/pdf-renderer', () => ({
  renderToBlob: (component: unknown, options: { inputs?: Record<string, unknown> }) =>
    new Promise<Blob>((resolve, reject) => {
      const blob = new Blob([JSON.stringify(options.inputs ?? {})], { type: 'application/pdf' });
      const call: Render = {
        component,
        inputs: options.inputs,
        resolve: () => {
          resolve(blob);
        },
        reject,
      };
      renders.calls.push(call);
      if (!renders.manual) call.resolve();
    }),
}));

@Component({ selector: 'pdf-test-invoice', template: '' })
class Invoice {}

@Component({ selector: 'pdf-test-receipt', template: '' })
class Receipt {}

@Component({
  imports: [PdfViewer],
  template: `
    <pdf-viewer
      [document]="document()"
      [inputs]="inputs()"
      [debounce]="0"
      (rendered)="rendered.push($event)"
      (failed)="failed.push($event)"
    >
      <p pdfViewerLoading>Rendering…</p>
      <p pdfViewerError>Could not show the PDF.</p>
    </pdf-viewer>
  `,
})
class Host {
  readonly document = signal<Type<unknown>>(Invoice);
  readonly inputs = signal<Record<string, unknown>>({ customer: 'ACME' });
  readonly rendered: Blob[] = [];
  readonly failed: unknown[] = [];
}

let urls = 0;
let revoked: string[] = [];
let makeUrl: (n: number) => string;

beforeEach(() => {
  renders.calls = [];
  renders.manual = false;
  urls = 0;
  revoked = [];
  makeUrl = (n) => `blob:test/${String(n)}`;
  // jsdom has no object URLs.
  URL.createObjectURL = () => makeUrl(++urls);
  URL.revokeObjectURL = (url: string) => revoked.push(url);
});

afterEach(() => {
  vi.useRealTimers();
});

const settle = () => TestBed.inject(ApplicationRef).whenStable();

function viewer(options: { inputs?: Record<string, unknown>; debounce?: number; label?: string }) {
  const fixture = TestBed.createComponent(PdfViewer);
  fixture.componentRef.setInput('document', Invoice);
  if (options.inputs) fixture.componentRef.setInput('inputs', options.inputs);
  fixture.componentRef.setInput('debounce', options.debounce ?? 0);
  if (options.label !== undefined) fixture.componentRef.setInput('label', options.label);
  return fixture;
}

function iframeOf(fixture: ComponentFixture<unknown>): HTMLIFrameElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector('iframe');
}

function textOf(fixture: ComponentFixture<unknown>, selector: string): string | undefined {
  const element = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
  if (!element) return undefined;
  // The slot is hidden with the `hidden` attribute on its wrapper.
  return element.closest('[hidden]') ? undefined : element.textContent.trim();
}

describe('PdfViewer', () => {
  it('renders the document once on start and shows it in an iframe', async () => {
    const fixture = viewer({ inputs: { customer: 'ACME' } });
    await settle();

    expect(renders.calls.map(({ component, inputs }) => ({ component, inputs }))).toEqual([
      { component: Invoice, inputs: { customer: 'ACME' } },
    ]);
    expect(iframeOf(fixture)?.getAttribute('src')).toBe('blob:test/1');
  });

  it('renders with no inputs when none are given', async () => {
    viewer({});
    await settle();

    expect(renders.calls.map((call) => call.inputs)).toEqual([{}]);
  });

  it('names the iframe "PDF preview" by default, or with its label', async () => {
    const plain = viewer({});
    const labelled = viewer({ label: 'Invoice 1024' });
    await settle();

    expect(iframeOf(plain)?.title).toBe('PDF preview');
    expect(iframeOf(labelled)?.title).toBe('Invoice 1024');
  });

  it('fills its host, which is a block', async () => {
    const fixture = TestBed.createComponent(Host);
    await settle();

    // TestBed's own root element is a div, so look at the pdf-viewer element inside a host.
    const host = (fixture.nativeElement as HTMLElement).querySelector('pdf-viewer')!;
    // jsdom has no default display for unknown elements; browsers make them inline.
    const inline = document.createElement('style');
    inline.textContent = 'pdf-viewer { display: inline }';
    document.head.append(inline);
    document.body.append(fixture.nativeElement as HTMLElement);
    try {
      const frame = getComputedStyle(iframeOf(fixture)!);
      expect(getComputedStyle(host).display).toBe('block');
      expect([frame.width, frame.height, frame.display]).toEqual(['100%', '100%', 'block']);
    } finally {
      (fixture.nativeElement as HTMLElement).remove();
      inline.remove();
    }
  });

  it('waits 300 ms by default before rendering', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fixture = TestBed.createComponent(PdfViewer);
    fixture.componentRef.setInput('document', Invoice);
    fixture.detectChanges();

    await vi.advanceTimersByTimeAsync(299);
    expect(renders.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(renders.calls).toHaveLength(1);
    fixture.destroy();
  });

  it('renders again when the inputs change, after the debounce, and keeps the old PDF meanwhile', async () => {
    const fixture = viewer({ inputs: { customer: 'ACME' }, debounce: 20 });
    await settle();
    expect(iframeOf(fixture)?.getAttribute('src')).toBe('blob:test/1');

    fixture.componentRef.setInput('inputs', { customer: 'Globex' });
    fixture.detectChanges();
    expect(renders.calls).toHaveLength(1);
    expect(iframeOf(fixture)?.getAttribute('src')).toBe('blob:test/1');

    await settle();

    expect(renders.calls.map((call) => call.inputs)).toEqual([
      { customer: 'ACME' },
      { customer: 'Globex' },
    ]);
    expect(iframeOf(fixture)?.getAttribute('src')).toBe('blob:test/2');
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('renders the new document when the document changes', async () => {
    const fixture = TestBed.createComponent(Host);
    await settle();

    fixture.componentInstance.document.set(Receipt);
    fixture.detectChanges();
    // The old PDF stays on screen until the new document's PDF is there.
    expect(iframeOf(fixture)?.getAttribute('src')).toBe('blob:test/1');
    expect(revoked).toEqual([]);
    await settle();

    expect(renders.calls.map((call) => call.component)).toEqual([Invoice, Receipt]);
    expect(iframeOf(fixture)?.getAttribute('src')).toBe('blob:test/2');
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('keeps the old PDF on screen when the debounce changes, until the new render is there', async () => {
    const fixture = viewer({ debounce: 0 });
    await settle();
    expect(iframeOf(fixture)?.getAttribute('src')).toBe('blob:test/1');

    fixture.componentRef.setInput('debounce', 20);
    fixture.detectChanges();
    expect(iframeOf(fixture)?.getAttribute('src')).toBe('blob:test/1');
    expect(revoked).toEqual([]);

    await settle();
    expect(iframeOf(fixture)?.getAttribute('src')).toBe('blob:test/2');
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('revokes the old URL when it is destroyed while a replacement renders', async () => {
    renders.manual = true;
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    renders.calls[0]!.resolve();
    await settle();
    expect(iframeOf(fixture)?.getAttribute('src')).toBe('blob:test/1');

    fixture.componentInstance.document.set(Receipt);
    fixture.detectChanges();
    await vi.waitFor(() => {
      expect(renders.calls).toHaveLength(2);
    });
    fixture.destroy();
    renders.calls[1]!.resolve();
    await Promise.resolve();

    expect(revoked).toEqual(['blob:test/1']);
  });

  it('drops a render that a newer one overtakes', async () => {
    renders.manual = true;
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await vi.waitFor(() => {
      expect(renders.calls).toHaveLength(1);
    });

    fixture.componentInstance.inputs.set({ customer: 'Globex' });
    fixture.detectChanges();
    await vi.waitFor(() => {
      expect(renders.calls).toHaveLength(2);
    });

    renders.calls[0]!.resolve();
    renders.calls[1]!.resolve();
    await settle();

    expect(fixture.componentInstance.rendered).toHaveLength(1);
    expect(await fixture.componentInstance.rendered[0]!.text()).toBe('{"customer":"Globex"}');
    expect(iframeOf(fixture)?.getAttribute('src')).toBe('blob:test/1');
  });

  it('emits rendered with the Blob after each render', async () => {
    const fixture = TestBed.createComponent(Host);
    await settle();
    fixture.componentInstance.inputs.set({ customer: 'Globex' });
    await settle();

    const texts = await Promise.all(fixture.componentInstance.rendered.map((blob) => blob.text()));
    expect(texts).toEqual(['{"customer":"ACME"}', '{"customer":"Globex"}']);
    expect(fixture.componentInstance.failed).toEqual([]);
  });

  it('shows the loading content until the first PDF is there', async () => {
    renders.manual = true;
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(textOf(fixture, '[pdfViewerLoading]')).toBe('Rendering…');
    expect(textOf(fixture, '[pdfViewerError]')).toBeUndefined();
    expect(iframeOf(fixture)).toBeNull();

    await vi.waitFor(() => {
      expect(renders.calls).toHaveLength(1);
    });
    renders.calls[0]!.resolve();
    await settle();

    expect(textOf(fixture, '[pdfViewerLoading]')).toBeUndefined();
    expect(iframeOf(fixture)).not.toBeNull();
  });

  it('shows the error content and emits failed when a render fails', async () => {
    renders.manual = true;
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await vi.waitFor(() => {
      expect(renders.calls).toHaveLength(1);
    });

    const error = new Error('ngpdf: render failed');
    renders.calls[0]!.reject(error);
    await settle();

    expect(fixture.componentInstance.failed).toEqual([error]);
    expect(fixture.componentInstance.rendered).toEqual([]);
    expect(textOf(fixture, '[pdfViewerError]')).toBe('Could not show the PDF.');
    expect(textOf(fixture, '[pdfViewerLoading]')).toBeUndefined();
    expect(iframeOf(fixture)).toBeNull();
  });

  it('revokes its URL when it is destroyed', async () => {
    const fixture = viewer({});
    await settle();
    expect(revoked).toEqual([]);

    fixture.destroy();

    expect(revoked).toEqual(['blob:test/1']);
  });

  it('does not set the iframe source again while the old PDF stays on screen', async () => {
    const fixture = TestBed.createComponent(Host);
    await settle();
    const iframe = iframeOf(fixture);
    const trust = vi.spyOn(TestBed.inject(DomSanitizer), 'bypassSecurityTrustResourceUrl');

    fixture.componentInstance.document.set(Receipt);
    fixture.detectChanges();

    // A new trusted value, even for the same URL, would make Angular write [src] and reload it.
    expect(trust).not.toHaveBeenCalled();
    expect(iframeOf(fixture)).toBe(iframe);
    await settle();
    expect(trust.mock.calls).toEqual([['blob:test/2']]);
  });

  it('trusts only a blob: URL as the iframe source', async () => {
    makeUrl = () => 'https://example.com/not-a-blob.pdf';
    const fixture = viewer({});
    await settle();

    expect(iframeOf(fixture)).toBeNull();
  });
});
