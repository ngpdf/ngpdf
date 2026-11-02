import { Component } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { renderToBuffer } from './render-to-buffer';

// An @angular/core 22.x that no longer exports the private root-scope token.
vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ɵINJECTOR_SCOPE: undefined,
}));

const created = vi.fn();

@Component({ selector: 'pdf-scope-document', template: '' })
class ScopeDocument {
  constructor() {
    created();
  }
}

describe('renderToBuffer without ɵINJECTOR_SCOPE', () => {
  it('rejects with a clear error before creating the document', async () => {
    await expect(renderToBuffer(ScopeDocument)).rejects.toThrow(
      'ngpdf: this @angular/core has no ɵINJECTOR_SCOPE, which renderToBuffer needs without an injector; pass one',
    );
    expect(created).not.toHaveBeenCalled();
  });
});
