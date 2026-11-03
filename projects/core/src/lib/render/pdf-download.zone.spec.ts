// @vitest-environment jsdom
// zone.js patches Promise and the timers for good once loaded, so it gets a file of its own:
// Vitest runs each spec file in a fresh environment, and the other specs stay zoneless.
import 'zone.js';
import { Component, provideZoneChangeDetection, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PdfDownload } from './pdf-download';

const downloads = vi.hoisted(() => ({
  calls: 0,
  settle: undefined as (() => void) | undefined,
}));

// The directive only wires a click to downloadPdf, which has its own specs.
vi.mock('./pdf-renderer', () => ({
  downloadPdf: (): Promise<void> => {
    downloads.calls++;
    return new Promise((resolve) => {
      downloads.settle = resolve;
    });
  },
}));

@Component({ selector: 'pdf-test-document', template: '' })
class TestDocument {}

@Component({
  imports: [PdfDownload],
  template: `<button type="button" [pdfDownload]="document" pdfFileName="a.pdf">Download</button>`,
})
class ButtonHost {
  readonly document: Type<unknown> = TestDocument;
}

describe('PdfDownload under zone.js', () => {
  it('clears the busy state under zone.js change detection', async () => {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection()] });
    const fixture = TestBed.createComponent(ButtonHost);
    // Under zone.js the fixture does not run change detection by itself.
    fixture.detectChanges();
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;

    button.click();
    expect(downloads.calls).toBe(1);
    downloads.settle?.();
    await fixture.whenStable();

    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });
});
