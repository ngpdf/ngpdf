import {
  Component,
  DOCUMENT,
  DestroyRef,
  EnvironmentInjector,
  InjectionToken,
  Injectable,
  Injector,
  NgZone,
  createEnvironmentInjector,
  inject,
  input,
  provideZonelessChangeDetection,
  ɵINJECTOR_SCOPE as INJECTOR_SCOPE,
} from '@angular/core';
import { PDF_ELEMENTS, providePdfFonts } from '@ngpdf/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testFont } from '../src/testing/test-fonts';
import { renderToBuffer } from './render-to-buffer';

// What Node resolves `pdfkit` to: its Node build, which loads the standard fonts itself and has no
// registerStdFonts. A real module namespace reads that missing export as undefined.
const NODE_BUILD = '../../../node_modules/pdfkit/js/pdfkit.node.mjs';
vi.mock('pdfkit', async () => ({
  ...((await import(/* @vite-ignore */ NODE_BUILD)) as object),
  registerStdFonts: undefined,
}));

// The real engine, except that PDFs are written uncompressed so their text is readable.
vi.mock('../src/lib/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/engine')>();
  const { createPdfkitWriter } = await import('../src/lib/engine/writer');
  return {
    ...actual,
    renderDocument: async (
      root: Parameters<typeof actual.renderDocument>[0],
      options: Parameters<typeof actual.renderDocument>[1],
    ) =>
      actual.renderDocument(root, {
        ...options,
        dev: false,
        writer: await createPdfkitWriter({ compress: false }),
      }),
  };
});

const GREETING = new InjectionToken<string>('greeting');
const destroyed: string[] = [];

@Injectable({ providedIn: 'root' })
class Clock {
  readonly year = '2026';

  constructor() {
    inject(DestroyRef).onDestroy(() => destroyed.push('clock'));
  }
}

@Component({
  selector: 'pdf-server-document',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page>
        <pdf-text style="font-family: Helvetica; font-weight: bold">{{ greeting }}</pdf-text>
        <pdf-text style="font-family: Times">{{ name() }} {{ clock.year }}</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
class ServerDocument {
  readonly name = input('nobody');
  protected readonly greeting = inject(GREETING, { optional: true }) ?? 'Hello';
  protected readonly clock = inject(Clock);

  constructor() {
    inject(DestroyRef).onDestroy(() => destroyed.push('document'));
  }
}

@Component({
  selector: 'pdf-image-document',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page><pdf-image [src]="src()" style="width: 20; height: 10" /></pdf-page>
    </pdf-document>
  `,
})
class ImageDocument {
  readonly src = input.required<string | Uint8Array>();
}

@Component({
  selector: 'pdf-font-document',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page><pdf-text style="font-family: Noto Sans">Zoë</pdf-text></pdf-page>
    </pdf-document>
  `,
})
class FontDocument {}

@Component({
  selector: 'pdf-zone-document',
  imports: [PDF_ELEMENTS],
  template: `<pdf-document
    ><pdf-page
      ><pdf-text>{{ zone }}</pdf-text></pdf-page
    ></pdf-document
  >`,
})
class ZoneDocument {
  // Libraries often inject NgZone to run code outside Angular.
  protected readonly zone = inject(NgZone) instanceof NgZone ? 'zone' : 'noop zone';
}

@Component({ selector: 'pdf-no-document', imports: [PDF_ELEMENTS], template: '<pdf-page />' })
class NoDocument {
  constructor() {
    inject(DestroyRef).onDestroy(() => destroyed.push('no-document'));
  }
}

/** The strings the PDF shows: each `[<hex> kern <hex>] TJ` line joined and decoded. */
function shownText(pdf: Uint8Array): string[] {
  return new TextDecoder('latin1')
    .decode(pdf)
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

const latin1 = (pdf: Uint8Array): string => new TextDecoder('latin1').decode(pdf);

/** A 1×1 PNG. */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
);

/** A stand-in for an app's root injector: root scope, a DOCUMENT and the app's services. */
function appInjector(): EnvironmentInjector {
  return createEnvironmentInjector(
    [
      { provide: INJECTOR_SCOPE, useValue: 'root' },
      { provide: DOCUMENT, useValue: {} },
      provideZonelessChangeDetection(),
      { provide: GREETING, useValue: 'From the app' },
    ],
    Injector.NULL as EnvironmentInjector,
  );
}

afterEach(() => {
  destroyed.length = 0;
  vi.unstubAllGlobals();
});

describe('renderToBuffer', () => {
  it('renders a document to PDF bytes in Node, with no DOM', async () => {
    expect(typeof document).toBe('undefined');
    const pdf = await renderToBuffer(ServerDocument);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(latin1(pdf.slice(0, 5))).toBe('%PDF-');
    expect(shownText(pdf)).toEqual(['Hello', 'nobody 2026']);
  });

  it('draws the standard fonts with pdfkit’s Node build', async () => {
    const text = latin1(await renderToBuffer(ServerDocument));
    expect(text).toContain('/BaseFont /Helvetica-Bold');
    expect(text).toContain('/BaseFont /Times-Roman');
  });

  it('sets inputs and resolves the document’s providers', async () => {
    const pdf = await renderToBuffer(ServerDocument, {
      inputs: { name: 'Ada' },
      providers: [{ provide: GREETING, useValue: 'Good morning' }],
    });
    expect(shownText(pdf)).toEqual(['Good morning', 'Ada 2026']);
  });

  it('keeps two renders started together apart', async () => {
    const [first, second] = await Promise.all([
      renderToBuffer(ServerDocument, {
        inputs: { name: 'First' },
        providers: [{ provide: GREETING, useValue: 'One' }],
      }),
      renderToBuffer(ServerDocument, { inputs: { name: 'Second' } }),
    ]);
    expect(shownText(first)).toEqual(['One', 'First 2026']);
    expect(shownText(second)).toEqual(['Hello', 'Second 2026']);
  });

  it('runs zoneless, giving services that inject NgZone a no-op zone', async () => {
    expect(shownText(await renderToBuffer(ZoneDocument))).toEqual(['noop zone']);
  });

  it('destroys the document and its own injector after the render', async () => {
    await renderToBuffer(ServerDocument);
    expect(destroyed).toEqual(['document', 'clock']);
  });

  it('destroys them and rejects when the render fails', async () => {
    await expect(renderToBuffer(NoDocument)).rejects.toThrow('ngpdf: no pdf-document');
    expect(destroyed).toEqual(['no-document']);
  });

  describe('with an injector, as in an Angular SSR route', () => {
    it('resolves the app’s services from it and leaves it alive', async () => {
      const injector = createEnvironmentInjector([], appInjector());
      const pdf = await renderToBuffer(ServerDocument, { injector, inputs: { name: 'Grace' } });
      expect(shownText(pdf)).toEqual(['From the app', 'Grace 2026']);
      expect(() => injector.get(GREETING)).not.toThrow();
    });

    it('adds the given providers on top of it', async () => {
      const injector = createEnvironmentInjector([], appInjector());
      const pdf = await renderToBuffer(ServerDocument, {
        injector,
        providers: [{ provide: GREETING, useValue: 'Overridden' }],
      });
      expect(shownText(pdf)).toEqual(['Overridden', 'nobody 2026']);
      expect(injector.get(GREETING)).toBe('From the app');
    });
  });

  describe('images', () => {
    it('refuses a remote URL without fetchImage, and never calls fetch', async () => {
      const fetchFn = vi.fn();
      vi.stubGlobal('fetch', fetchFn);
      await expect(
        renderToBuffer(ImageDocument, { inputs: { src: 'https://cdn.example.com/a.png?t=1' } }),
      ).rejects.toThrow(
        'ngpdf: remote image "https://cdn.example.com/a.png" refused on the server; pass fetchImage',
      );
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('reads a remote URL through fetchImage', async () => {
      const fetchImage = vi.fn(() => Promise.resolve(PNG));
      const pdf = await renderToBuffer(ImageDocument, {
        inputs: { src: 'https://cdn.example.com/a.png' },
        fetchImage,
      });
      expect(fetchImage).toHaveBeenCalledWith('https://cdn.example.com/a.png');
      expect(latin1(pdf)).toContain('/Subtype /Image');
    });

    it('refuses a relative URL', async () => {
      await expect(
        renderToBuffer(ImageDocument, {
          inputs: { src: '/logo.png' },
          fetchImage: () => Promise.resolve(PNG),
        }),
      ).rejects.toThrow('ngpdf: relative image URL "/logo.png" on the server');
    });

    it('loads bytes, such as a Buffer from readFile, without fetchImage', async () => {
      const pdf = await renderToBuffer(ImageDocument, { inputs: { src: PNG } });
      expect(latin1(pdf)).toContain('/Subtype /Image');
    });

    it('loads a data URL without fetchImage', async () => {
      const src = `data:image/png;base64,${btoa(String.fromCharCode(...PNG))}`;
      const pdf = await renderToBuffer(ImageDocument, { inputs: { src } });
      expect(latin1(pdf)).toContain('/Subtype /Image');
    });
  });

  describe('fonts', () => {
    const fonts = providePdfFonts([
      { family: 'Noto Sans', src: 'https://fonts.example.com/noto.ttf' },
    ]);

    it('refuses a font URL without fetchImage', async () => {
      await expect(renderToBuffer(FontDocument, { providers: [fonts] })).rejects.toThrow(
        'ngpdf: remote font "https://fonts.example.com/noto.ttf" refused on the server; pass fetchImage',
      );
    });

    it('reads a font URL through fetchImage', async () => {
      const fetchImage = vi.fn(() => Promise.resolve(testFont('noto-sans-regular.ttf')));
      const pdf = await renderToBuffer(FontDocument, { providers: [fonts], fetchImage });
      expect(fetchImage).toHaveBeenCalledWith('https://fonts.example.com/noto.ttf');
      expect(latin1(pdf)).toContain('/FontFile2');
    });

    it('reads a font URL with each render’s own fetchImage when they share an injector', async () => {
      // One app injector, so one providePdfFonts for every tenant's render.
      const injector = createEnvironmentInjector([fonts], appInjector());
      const first = vi.fn(() => Promise.resolve(testFont('noto-sans-regular.ttf')));
      const second = vi.fn(() => Promise.reject(new Error('not for this tenant')));
      await renderToBuffer(FontDocument, { injector, fetchImage: first });
      await expect(renderToBuffer(FontDocument, { injector, fetchImage: second })).rejects.toThrow(
        'ngpdf: could not load font "https://fonts.example.com/noto.ttf": not for this tenant',
      );
      expect(second).toHaveBeenCalledWith('https://fonts.example.com/noto.ttf');
    });

    it('does so for fonts of a parent injector too, as an app’s under a route’s', async () => {
      const app = createEnvironmentInjector([fonts], appInjector());
      const routeFonts = providePdfFonts([{ family: 'Route Sans', src: 'data:font/ttf,' }]);
      const injector = createEnvironmentInjector([routeFonts], app);
      const first = vi.fn(() => Promise.resolve(testFont('noto-sans-regular.ttf')));
      const second = vi.fn(() => Promise.reject(new Error('not for this tenant')));
      await renderToBuffer(FontDocument, { injector, fetchImage: first });
      await expect(renderToBuffer(FontDocument, { injector, fetchImage: second })).rejects.toThrow(
        'not for this tenant',
      );
    });

    it('embeds font bytes without fetchImage', async () => {
      const pdf = await renderToBuffer(FontDocument, {
        providers: [
          providePdfFonts([{ family: 'Noto Sans', src: testFont('noto-sans-regular.ttf') }]),
        ],
      });
      expect(latin1(pdf)).toContain('/FontFile2');
    });
  });
});
