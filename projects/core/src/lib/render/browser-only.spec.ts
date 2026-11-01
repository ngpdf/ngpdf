import { Component, EnvironmentInjector, Injector, createEnvironmentInjector } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { downloadPdf } from './pdf-renderer';
import { pdfResource } from './pdf-resource';

// Node, as a plain script or an Angular SSR server runs: no global `document`.
const created = vi.fn();

@Component({ selector: 'pdf-test-document', template: '' })
class TestDocument {
  constructor() {
    created();
  }
}

const injector = (): EnvironmentInjector =>
  createEnvironmentInjector([], Injector.NULL as EnvironmentInjector);

describe('browser-only APIs in Node', () => {
  it('downloadPdf rejects before rendering', async () => {
    expect(typeof document).toBe('undefined');
    await expect(
      downloadPdf(TestDocument, { injector: injector(), fileName: 'a.pdf' }),
    ).rejects.toThrow('ngpdf: downloadPdf needs a browser');
    expect(created).not.toHaveBeenCalled();
  });

  it('pdfResource throws', () => {
    expect(() => pdfResource(TestDocument, { injector: injector() })).toThrow(
      'ngpdf: pdfResource needs a browser',
    );
  });
});
