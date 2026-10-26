// @vitest-environment jsdom
import {
  Component,
  ErrorHandler,
  provideZoneChangeDetection,
  signal,
  type Type,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfDownload } from './pdf-download';

const downloads = vi.hoisted(() => ({
  calls: [] as { component: unknown; inputs: unknown; fileName: string }[],
  settle: undefined as ((error?: Error) => void) | undefined,
}));

// The directive only wires a click to downloadPdf, which has its own specs.
vi.mock('./pdf-renderer', () => ({
  downloadPdf: (
    component: unknown,
    options: { inputs?: unknown; fileName: string },
  ): Promise<void> => {
    downloads.calls.push({ component, inputs: options.inputs, fileName: options.fileName });
    return new Promise((resolve, reject) => {
      downloads.settle = (error) => {
        if (error) reject(error);
        else resolve();
      };
    });
  },
}));

@Component({ selector: 'pdf-test-document', template: '' })
class TestDocument {}

@Component({
  imports: [PdfDownload],
  template: `
    <button
      type="button"
      [pdfDownload]="document"
      [pdfInputs]="{ customer: customer() }"
      pdfFileName="invoice.pdf"
      (pdfError)="errors.push($event)"
    >
      Download
    </button>
  `,
})
class ButtonHost {
  readonly document: Type<unknown> = TestDocument;
  readonly customer = signal('ACME');
  readonly errors: unknown[] = [];
}

@Component({
  imports: [PdfDownload],
  template: `<button type="button" disabled [pdfDownload]="document" pdfFileName="a.pdf">
    Download
  </button>`,
})
class DisabledHost {
  readonly document: Type<unknown> = TestDocument;
}

@Component({
  imports: [PdfDownload],
  template: `<button
    type="button"
    [disabled]="locked()"
    [pdfDownload]="document"
    pdfFileName="a.pdf"
  >
    Download
  </button>`,
})
class BoundDisabledHost {
  readonly document: Type<unknown> = TestDocument;
  readonly locked = signal(false);
}

@Component({
  imports: [PdfDownload],
  template: `
    <form (submit)="submits = submits + 1; $event.preventDefault()">
      <button type="submit" [pdfDownload]="document" pdfFileName="a.pdf">Download</button>
    </form>
  `,
})
class SubmitHost {
  readonly document: Type<unknown> = TestDocument;
  submits = 0;
}

const handled: unknown[] = [];

beforeEach(() => {
  downloads.calls = [];
  downloads.settle = undefined;
  handled.length = 0;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: ErrorHandler, useValue: { handleError: (e: unknown) => handled.push(e) } },
    ],
  });
});

async function render<T>(host: Type<T>) {
  const fixture = TestBed.createComponent(host);
  // Under zone.js the fixture does not run change detection by itself.
  fixture.detectChanges();
  await fixture.whenStable();
  const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  return { fixture, button };
}

describe('PdfDownload', () => {
  it('downloads the document with its inputs and file name on click', async () => {
    const { button } = await render(ButtonHost);

    button.click();

    expect(downloads.calls).toEqual([
      { component: TestDocument, inputs: { customer: 'ACME' }, fileName: 'invoice.pdf' },
    ]);
  });

  it('uses the inputs as they are at the time of the click', async () => {
    const { fixture, button } = await render(ButtonHost);
    fixture.componentInstance.customer.set('Globex');
    await fixture.whenStable();

    button.click();

    expect(downloads.calls[0]?.inputs).toEqual({ customer: 'Globex' });
  });

  it('marks its host busy and aria-disabled while the PDF renders', async () => {
    const { fixture, button } = await render(ButtonHost);

    button.click();
    // whenStable would wait for the download itself: the directive holds a pending task.
    fixture.detectChanges();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.disabled).toBe(false);

    downloads.settle?.();
    await fixture.whenStable();
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
  });

  it('ignores clicks while a download is under way', async () => {
    const { button } = await render(ButtonHost);

    button.click();
    button.click();

    expect(downloads.calls).toHaveLength(1);
  });

  it('cancels the default action of a click while busy, so a form is not submitted twice', async () => {
    const { fixture, button } = await render(SubmitHost);

    button.click();
    button.click();

    expect(downloads.calls).toHaveLength(1);
    expect(fixture.componentInstance.submits).toBe(1);
  });

  it('emits pdfError and reports to the ErrorHandler when the render fails', async () => {
    const { fixture, button } = await render(ButtonHost);
    const failure = new Error('ngpdf: render failed');

    button.click();
    downloads.settle?.(failure);
    await fixture.whenStable();

    expect(fixture.componentInstance.errors).toEqual([failure]);
    expect(handled).toEqual([failure]);
    expect(button.disabled).toBe(false);
  });

  it('leaves a host that is disabled on its own alone', async () => {
    const { button } = await render(DisabledHost);

    expect(button.disabled).toBe(true);
  });

  it('keeps a host disabled that the app disabled while the PDF rendered', async () => {
    const { fixture, button } = await render(BoundDisabledHost);

    button.click();
    fixture.componentInstance.locked.set(true);
    fixture.detectChanges();
    downloads.settle?.();
    await fixture.whenStable();

    expect(button.disabled).toBe(true);
  });

  it('clears the busy state under zone.js change detection', async () => {
    await import('zone.js');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection()] });
    const { fixture, button } = await render(ButtonHost);

    button.click();
    expect(downloads.calls).toHaveLength(1);
    downloads.settle?.();
    await fixture.whenStable();

    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });
});
