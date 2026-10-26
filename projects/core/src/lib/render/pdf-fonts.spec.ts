// @vitest-environment jsdom
import { Component, EnvironmentInjector, createEnvironmentInjector, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testFont } from '../../testing/test-fonts';
import { PDF_ELEMENTS } from '../elements';
import { providePdfFonts } from './pdf-fonts';
import { PdfRenderer, renderToBlob } from './pdf-renderer';

@Component({
  selector: 'pdf-font-document',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page>
        <pdf-text [style.font-family]="family()">Zoë Łódź 日本語</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
class FontDocument {
  readonly family = input('Noto Sans, Noto Sans JP');
}

const REGULAR = testFont('noto-sans-regular.ttf');
const JP = testFont('noto-sans-jp-subset.ttf');

/** How many fonts the PDF embeds. */
async function embedded(blob: Blob): Promise<number> {
  const pdf = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
  return pdf.match(/\/FontFile2/g)?.length ?? 0;
}

/** A fetch that serves the font bytes by path and counts the calls. */
function serveFonts(files: Record<string, Uint8Array>) {
  const fetchFn = vi.fn((url: string) => {
    const bytes = files[url];
    return Promise.resolve(
      bytes ? new Response(bytes.slice().buffer) : new Response(null, { status: 404 }),
    );
  });
  vi.stubGlobal('fetch', fetchFn);
  return fetchFn;
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('providePdfFonts', () => {
  it('draws text in the registered families, embedding each one used', async () => {
    TestBed.configureTestingModule({
      providers: [
        providePdfFonts([
          { family: 'Noto Sans', src: REGULAR },
          { family: 'Noto Sans JP', src: JP.slice().buffer },
        ]),
      ],
    });
    const blob = await TestBed.inject(PdfRenderer).toBlob(FontDocument);
    expect(await embedded(blob)).toBe(2);
  });

  it('leaves text in other families on the standard fonts', async () => {
    TestBed.configureTestingModule({
      providers: [providePdfFonts([{ family: 'Noto Sans', src: REGULAR }])],
    });
    const blob = await TestBed.inject(PdfRenderer).toBlob(FontDocument, {
      inputs: { family: 'Helvetica' },
    });
    expect(await embedded(blob)).toBe(0);
  });

  it('fetches a font URL once and reuses it in later renders', async () => {
    const fetchFn = serveFonts({ '/fonts/noto.ttf': REGULAR });
    TestBed.configureTestingModule({
      providers: [providePdfFonts([{ family: 'Noto Sans', src: '/fonts/noto.ttf' }])],
    });
    const renderer = TestBed.inject(PdfRenderer);
    await renderer.toBlob(FontDocument);
    const blob = await renderer.toBlob(FontDocument);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await embedded(blob)).toBe(1);
  });

  it('reads a Blob source', async () => {
    TestBed.configureTestingModule({
      providers: [providePdfFonts([{ family: 'Noto Sans', src: new Blob([REGULAR.slice()]) }])],
    });
    expect(await embedded(await TestBed.inject(PdfRenderer).toBlob(FontDocument))).toBe(1);
  });

  it('rejects a render whose font cannot be fetched, and tries again on the next one', async () => {
    const fetchFn = serveFonts({});
    TestBed.configureTestingModule({
      providers: [providePdfFonts([{ family: 'Noto Sans', src: '/fonts/gone.ttf?v=2' }])],
    });
    const renderer = TestBed.inject(PdfRenderer);
    await expect(renderer.toBlob(FontDocument)).rejects.toThrow(
      'ngpdf: could not load font "/fonts/gone.ttf": HTTP 404',
    );
    await expect(renderer.toBlob(FontDocument)).rejects.toThrow('ngpdf: could not load font');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('rejects bytes that are not a font, naming the source', async () => {
    TestBed.configureTestingModule({
      providers: [providePdfFonts([{ family: 'Noto Sans', src: new Uint8Array([1, 2, 3]) }])],
    });
    await expect(TestBed.inject(PdfRenderer).toBlob(FontDocument)).rejects.toThrow(
      'ngpdf: invalid font "Uint8Array"',
    );
  });

  it('adds the fonts of a child injector to those of its parent', async () => {
    TestBed.configureTestingModule({
      providers: [providePdfFonts([{ family: 'Noto Sans', src: REGULAR }])],
    });
    const parent = TestBed.inject(EnvironmentInjector);
    const route = createEnvironmentInjector(
      [providePdfFonts([{ family: 'Noto Sans JP', src: JP }])],
      parent,
    );
    expect(await embedded(await renderToBlob(FontDocument, { injector: route }))).toBe(2);
    expect(await embedded(await renderToBlob(FontDocument, { injector: parent }))).toBe(1);
    route.destroy();
  });

  it('merges two providePdfFonts calls in the same injector', async () => {
    TestBed.configureTestingModule({
      providers: [
        providePdfFonts([{ family: 'Noto Sans', src: REGULAR }]),
        providePdfFonts([{ family: 'Noto Sans JP', src: JP }]),
      ],
    });
    expect(await embedded(await TestBed.inject(PdfRenderer).toBlob(FontDocument))).toBe(2);
  });
});
