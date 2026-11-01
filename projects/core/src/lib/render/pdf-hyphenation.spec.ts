// @vitest-environment jsdom
import { Component, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDF_ELEMENTS } from '../elements';
import { providePdfHyphenation } from './pdf-hyphenation';
import { PdfRenderer, renderToBlob } from './pdf-renderer';

@Component({
  selector: 'pdf-hyphenated-document',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document language="pt-BR">
      <pdf-page>
        <pdf-view style="width: 40pt; hyphens: auto">
          <pdf-text>hifenização</pdf-text>
        </pdf-view>
      </pdf-page>
    </pdf-document>
  `,
})
class HyphenatedDocument {}

const syllables = (word: string): readonly string[] =>
  word === 'hifenização' ? ['hi', 'fe', 'ni', 'za', 'ção'] : [word];

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

describe('providePdfHyphenation', () => {
  it('hands the function to the engine, which calls it with the document language', async () => {
    const hyphenate = vi.fn(syllables);
    TestBed.configureTestingModule({ providers: [providePdfHyphenation(hyphenate)] });
    await TestBed.inject(PdfRenderer).toBlob(HyphenatedDocument);
    expect(hyphenate).toHaveBeenCalledExactlyOnceWith('hifenização', 'pt-BR');
  });

  it('lets a child injector replace the function of its parent', async () => {
    const parent = vi.fn(syllables);
    const child = vi.fn(syllables);
    TestBed.configureTestingModule({ providers: [providePdfHyphenation(parent)] });
    const injector = createEnvironmentInjector(
      [providePdfHyphenation(child)],
      TestBed.inject(EnvironmentInjector),
    );
    await renderToBlob(HyphenatedDocument, { injector });
    expect(child).toHaveBeenCalledOnce();
    expect(parent).not.toHaveBeenCalled();
  });

  it('renders without a function, warning in dev mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await TestBed.inject(PdfRenderer).toBlob(HyphenatedDocument);
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: hyphens: auto needs providePdfHyphenation; words break only at soft hyphens',
    );
  });
});
