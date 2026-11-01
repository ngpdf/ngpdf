// @vitest-environment jsdom
import { Component, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDF_ELEMENTS } from '../elements';
import { providePdfEmoji } from './pdf-emoji';
import { PdfRenderer, renderToBlob } from './pdf-renderer';

@Component({
  selector: 'pdf-emoji-document',
  imports: [PDF_ELEMENTS],
  template: `
    <pdf-document>
      <pdf-page>
        <pdf-text>Shipped 👍🏽 and 🎉, again 👍🏽</pdf-text>
      </pdf-page>
    </pdf-document>
  `,
})
class EmojiDocument {}

// A 1×1 opaque PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4y2AIAALMAQ+JqrH2AAAAAElFTkSuQmCC';
const PNG = `data:image/png;base64,${PNG_BASE64}`;

/** How many images the PDF embeds. */
async function images(blob: Blob): Promise<number> {
  const pdf = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
  return pdf.match(/\/Subtype \/Image/g)?.length ?? 0;
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('providePdfEmoji', () => {
  it('draws emoji with the images a function returns', async () => {
    const source = vi.fn(() => PNG);
    TestBed.configureTestingModule({ providers: [providePdfEmoji(source)] });
    const blob = await TestBed.inject(PdfRenderer).toBlob(EmojiDocument);
    expect(source.mock.calls).toEqual([
      ['👍🏽', '1f44d-1f3fd'],
      ['🎉', '1f389'],
    ]);
    // Both sequences have the same PNG, which the PDF embeds once.
    expect(await images(blob)).toBe(1);
  });

  it('fetches the images of a URL template', async () => {
    const bytes = Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0));
    const fetchFn = vi.fn(() => Promise.resolve(new Response(bytes.slice().buffer)));
    vi.stubGlobal('fetch', fetchFn);
    TestBed.configureTestingModule({
      providers: [providePdfEmoji('/emoji/{codepoints}.png')],
    });
    const blob = await TestBed.inject(PdfRenderer).toBlob(EmojiDocument);
    expect(fetchFn.mock.calls.map(([url]: unknown[]) => url)).toEqual([
      '/emoji/1f44d-1f3fd.png',
      '/emoji/1f389.png',
    ]);
    expect(await images(blob)).toBe(1);
  });

  it('fetches nothing without a provider, and draws emoji as text', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const blob = await TestBed.inject(PdfRenderer).toBlob(EmojiDocument);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('ngpdf: characters outside WinAnsi replaced with "?": 👍🏽🎉');
    expect(await images(blob)).toBe(0);
  });

  it('lets a child injector use its own source', async () => {
    const parent = vi.fn(() => PNG);
    const child = vi.fn(() => null);
    TestBed.configureTestingModule({ providers: [providePdfEmoji(parent)] });
    const injector = createEnvironmentInjector(
      [providePdfEmoji(child)],
      TestBed.inject(EnvironmentInjector),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const blob = await renderToBlob(EmojiDocument, { injector });
    expect(child).toHaveBeenCalledTimes(2);
    expect(parent).not.toHaveBeenCalled();
    expect(await images(blob)).toBe(0);
  });
});
