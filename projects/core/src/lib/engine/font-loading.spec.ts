import { describe, expect, it, vi } from 'vitest';
import { loadFont } from './font-loading';

const bytes = new Uint8Array([0, 1, 0, 0]);

describe('loadFont', () => {
  it('reads bytes, an ArrayBuffer and a data URL', async () => {
    expect((await loadFont(bytes)).data).toEqual(bytes);
    expect((await loadFont(bytes.slice().buffer)).label).toBe('ArrayBuffer');
    expect((await loadFont('data:font/ttf;base64,AAEAAA==')).data).toEqual(bytes);
  });

  describe('on the server', () => {
    it('refuses a remote URL without fetchImage', async () => {
      const fetchFn = vi.fn(() => Promise.resolve(new Response(bytes as BodyInit)));
      await expect(loadFont('https://fonts.example.com/a.ttf?key=1', fetchFn, {})).rejects.toThrow(
        /^ngpdf: remote font "https:\/\/fonts\.example\.com\/a\.ttf" refused on the server; pass fetchImage$/,
      );
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('reads a remote URL through fetchImage', async () => {
      const fetchImage = vi.fn(() => Promise.resolve(bytes));
      const font = await loadFont('https://fonts.example.com/a.ttf', undefined, { fetchImage });
      expect(fetchImage).toHaveBeenCalledWith('https://fonts.example.com/a.ttf');
      expect(font).toEqual({ label: 'https://fonts.example.com/a.ttf', data: bytes });
    });

    it('refuses a URL that is not http or https, before fetchImage sees it', async () => {
      const fetchImage = vi.fn(() => Promise.resolve(bytes));
      await expect(loadFont('file:///fonts/a.ttf', undefined, { fetchImage })).rejects.toThrow(
        'ngpdf: font URL "file:///fonts/a.ttf" is not http or https; the server reads no other scheme',
      );
      expect(fetchImage).not.toHaveBeenCalled();
    });

    it('strips the query string from the URL where a fetchImage error repeats it', async () => {
      const url = 'https://fonts.example.com/a.ttf?key=secret';
      const fetchImage = vi.fn(() => Promise.reject(new Error(`HTTP 403 for ${url}`)));
      await expect(loadFont(url, undefined, { fetchImage })).rejects.toThrow(
        /^ngpdf: could not load font "https:\/\/fonts\.example\.com\/a\.ttf": HTTP 403 for https:\/\/fonts\.example\.com\/a\.ttf$/,
      );
    });

    it('refuses a relative URL', async () => {
      const fetchImage = vi.fn(() => Promise.resolve(bytes));
      await expect(loadFont('/fonts/a.ttf', undefined, { fetchImage })).rejects.toThrow(
        'ngpdf: relative font URL "/fonts/a.ttf" on the server',
      );
      expect(fetchImage).not.toHaveBeenCalled();
    });

    it('still reads bytes and data URLs', async () => {
      expect((await loadFont(bytes, undefined, {})).data).toEqual(bytes);
      expect((await loadFont('data:font/ttf;base64,AAEAAA==', undefined, {})).data).toEqual(bytes);
    });
  });
});
