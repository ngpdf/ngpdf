import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createNode, type PdfNode } from '../tree/node';
import { fitImage, loadImages } from './images';
import { createPdfkitWriter, type PdfWriter } from './writer';

/** PNG signature plus an IHDR chunk: all `imageSize` reads. */
function pngHeader(width: number, height: number): Uint8Array {
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32(13),
    0x49,
    0x48,
    0x44,
    0x52,
    ...u32(width),
    ...u32(height),
    8,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function imageNode(src: unknown): PdfNode {
  const node = createNode('element', 'pdf-image');
  node.owner = { pdfProps: () => ({ src }) };
  return node;
}

function root(...children: PdfNode[]): PdfNode {
  const node = createNode('element', 'pdf-view');
  for (const child of children) {
    child.parent = node;
    node.children.push(child);
  }
  return node;
}

let writer: PdfWriter;
beforeAll(async () => {
  writer = await createPdfkitWriter({ compress: false });
});

const png = pngHeader(200, 100);

describe('loadImages', () => {
  it('loads a base64 PNG data URL with its natural size', async () => {
    const node = imageNode(`data:image/png;base64,${base64(png)}`);
    const assets = await loadImages(root(node), writer);
    expect(assets.get(node)).toEqual({ data: png, width: 200, height: 100 });
  });

  it.each(['DATA:image/png;BASE64,', 'Data:image/png;Base64,'])(
    'decodes a %s data URL without fetching it, as URL schemes are case-insensitive',
    async (prefix) => {
      const fetchFn = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
      const node = imageNode(`${prefix}${base64(png)}`);
      const assets = await loadImages(root(node), writer, fetchFn);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(assets.get(node)).toEqual({ data: png, width: 200, height: 100 });
    },
  );

  it('decodes a percent-encoded data URL', async () => {
    const encoded = Array.from(png, (b) => `%${b.toString(16).padStart(2, '0')}`).join('');
    const node = imageNode(`data:image/png,${encoded}`);
    const assets = await loadImages(root(node), writer);
    expect(assets.get(node)?.width).toBe(200);
  });

  it('decodes fully escaped and mostly plain percent-encoded data URLs to the same bytes', async () => {
    const escaped = imageNode(
      `data:image/png,${Array.from(png, (b) => `%${b.toString(16).padStart(2, '0')}`).join('')}`,
    );
    expect((await loadImages(root(escaped), writer)).get(escaped)?.data).toEqual(png);

    // Bytes written as Latin-1 characters, only `%` escaped.
    const text = Array.from(png, (b) => (b === 0x25 ? '%25' : String.fromCharCode(b))).join('');
    const plain = imageNode(`data:image/png,${text}`);
    expect((await loadImages(root(plain), writer)).get(plain)?.data).toEqual(png);
  });

  it('rejects a data URL without a comma', async () => {
    const bad = imageNode('data:image/png;base64');
    await expect(loadImages(root(bad), writer)).rejects.toThrow(/malformed data URL/);
  });

  it('keeps a literal percent byte that is not an escape', async () => {
    // Width 37 is 0x25, the byte for '%'; it is written as a bare '%' followed by an escape.
    const bytes = pngHeader(37, 100);
    const encoded = Array.from(bytes, (b) =>
      b === 0x25 ? '%' : `%${b.toString(16).padStart(2, '0')}`,
    ).join('');
    const node = imageNode(`data:image/png,${encoded}`);
    const assets = await loadImages(root(node), writer);
    expect(assets.get(node)).toEqual({ data: bytes, width: 37, height: 100 });
  });

  it('decodes a percent-encoded data URL of a few hundred KB, mixing escapes and plain bytes', async () => {
    // 300 KB after the PNG header; bytes that are letters or digits stay as they are, the rest
    // are escaped, so the encoded text is longer than the bytes and the output must be cut to fit.
    const header = pngHeader(640, 480);
    const bytes = new Uint8Array(header.length + 300_000);
    bytes.set(header);
    for (let i = header.length; i < bytes.length; i++) bytes[i] = (i * 31) & 0xff;
    const plain = (b: number) => /[0-9a-z]/i.test(String.fromCharCode(b));
    const encoded = Array.from(bytes, (b) =>
      plain(b) ? String.fromCharCode(b) : `%${b.toString(16).padStart(2, '0')}`,
    ).join('');
    const node = imageNode(`data:image/png,${encoded}`);
    const started = performance.now();
    const assets = await loadImages(root(node), writer);
    // About 90 ms on a developer machine. As with the text budget, the margin only has to separate
    // a linear decode on a busy CI runner with coverage on from a quadratic one.
    expect(performance.now() - started).toBeLessThan(2000);
    const asset = assets.get(node);
    expect([asset?.width, asset?.height]).toEqual([640, 480]);
    // A plain loop: `toEqual` walks a 300 KB typed array slowly enough to hit the test timeout.
    expect(asset?.data.length).toBe(bytes.length);
    expect(asset?.data.every((byte, i) => byte === bytes[i])).toBe(true);
  });

  it('loads a Blob and an ArrayBuffer the same way', async () => {
    const blobNode = imageNode(new Blob([png as BlobPart], { type: 'image/png' }));
    const bufferNode = imageNode(png.buffer.slice(0));
    const assets = await loadImages(root(blobNode, bufferNode), writer);
    expect(assets.get(blobNode)).toEqual({ data: png, width: 200, height: 100 });
    expect(assets.get(bufferNode)).toEqual({ data: png, width: 200, height: 100 });
  });

  it('fetches a URL with same-origin credentials', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(png as BodyInit)));
    const node = imageNode('/logo.png');
    const assets = await loadImages(root(node), writer, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('/logo.png', { credentials: 'same-origin' });
    expect(assets.get(node)?.height).toBe(100);
  });

  it('uses the global fetch bound at call time by default', async () => {
    const original = globalThis.fetch;
    const stub = vi.fn(() => Promise.resolve(new Response(png as BodyInit)));
    globalThis.fetch = stub;
    try {
      await loadImages(root(imageNode('https://example.test/a.png')), writer);
    } finally {
      globalThis.fetch = original;
    }
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('starts every fetch before any resolves', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchFn = vi.fn(async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return new Response(png as BodyInit);
    });
    await loadImages(root(imageNode('/a.png'), imageNode('/b.png')), writer, fetchFn);
    expect(peak).toBe(2);
  });

  it('fetches a repeated URL once', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(png as BodyInit)));
    const first = imageNode('/same.png');
    const second = imageNode('/same.png');
    const assets = await loadImages(root(first, second), writer, fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(assets.get(second)).toBe(assets.get(first));
  });

  it('rejects a 404 with the URL and the status', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response('no', { status: 404 })));
    await expect(
      loadImages(root(imageNode('/missing.png')), writer, fetchFn as unknown as typeof fetch),
    ).rejects.toThrow('ngpdf: could not load image "/missing.png": HTTP 404');
  });

  it('leaves the query string and fragment out of the error, as they often hold a token', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response('no', { status: 403 })));
    const load = (src: string) => loadImages(root(imageNode(src)), writer, fetchFn);
    await expect(load('https://cdn.example.com/a.png?token=secret#top')).rejects.toThrow(
      /^ngpdf: could not load image "https:\/\/cdn\.example\.com\/a\.png": HTTP 403$/,
    );
    await expect(load('/b.png#x?y')).rejects.toThrow(/^ngpdf: could not load image "\/b\.png": /);
    expect(fetchFn).toHaveBeenCalledWith('https://cdn.example.com/a.png?token=secret#top', {
      credentials: 'same-origin',
    });
  });

  it('rejects a failed fetch with the reason', async () => {
    const fetchFn = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(
      loadImages(root(imageNode('/cors.png')), writer, fetchFn as unknown as typeof fetch),
    ).rejects.toThrow('ngpdf: could not load image "/cors.png": Failed to fetch');
  });

  it('rejects bytes that are not an image, naming the source kind', async () => {
    const bad = new Uint8Array([1, 2, 3]);
    await expect(loadImages(root(imageNode(bad.buffer)), writer)).rejects.toThrow(
      /could not load image "ArrayBuffer"/,
    );
    await expect(loadImages(root(imageNode(new Blob([bad]))), writer)).rejects.toThrow(
      /could not load image "Blob"/,
    );
    await expect(
      loadImages(root(imageNode(`data:text/plain;base64,${base64(bad)}`)), writer),
    ).rejects.toThrow(/could not load image "data URL"/);
  });

  it('loads a Uint8Array, also a view into a larger buffer as a Node Buffer often is', async () => {
    const pooled = new Uint8Array(png.length + 16);
    pooled.set(png, 8);
    const view = pooled.subarray(8, 8 + png.length);
    const node = imageNode(view);
    const assets = await loadImages(root(node), writer);
    expect(assets.get(node)).toEqual({ data: png, width: 200, height: 100 });
  });

  it('names a Uint8Array that is not an image', async () => {
    await expect(loadImages(root(imageNode(new Uint8Array([1, 2, 3]))), writer)).rejects.toThrow(
      'ngpdf: could not load image "Uint8Array": ngpdf: image is neither PNG nor JPEG',
    );
  });

  it('rejects a source of the wrong type', async () => {
    await expect(loadImages(root(imageNode(42)), writer)).rejects.toThrow(/could not load image/);
  });

  it('ignores other elements and loads nested images', async () => {
    const nested = imageNode(png.buffer.slice(0));
    const inner = root(nested);
    const assets = await loadImages(root(inner, createNode('text', '', 'x')), writer);
    expect([...assets.keys()]).toEqual([nested]);
  });
});

describe('fitImage', () => {
  const asset = { data: new Uint8Array(), width: 200, height: 100 };

  it('contain letterboxes inside the box', () => {
    expect(fitImage(asset, { w: 100, h: 100 }, 'contain')).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });

  it('cover overflows the box on the short axis', () => {
    expect(fitImage(asset, { w: 100, h: 100 }, 'cover')).toEqual({ x: -50, y: 0, w: 200, h: 100 });
  });
});

describe('loadImages on the server', () => {
  const dataUrl = `data:image/png;base64,${base64(png)}`;

  it('refuses a remote URL without fetchImage, and never calls fetch', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(png as BodyInit)));
    const load = loadImages(root(imageNode('https://cdn.example.com/a.png')), writer, fetchFn, {});
    await expect(load).rejects.toThrow(
      /^ngpdf: remote image "https:\/\/cdn\.example\.com\/a\.png" refused on the server; pass fetchImage$/,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('leaves the query string out of the refusal', async () => {
    const load = loadImages(
      root(imageNode('https://cdn.example.com/a.png?token=secret')),
      writer,
      undefined,
      {},
    );
    await expect(load).rejects.toThrow(
      /^ngpdf: remote image "https:\/\/cdn\.example\.com\/a\.png" refused/,
    );
  });

  it('reads a remote URL through fetchImage, with the whole URL', async () => {
    const fetchImage = vi.fn(() => Promise.resolve(png));
    const fetchFn = vi.fn(() => Promise.resolve(new Response(png as BodyInit)));
    const node = imageNode('https://cdn.example.com/a.png?size=2');
    const assets = await loadImages(root(node), writer, fetchFn, { fetchImage });
    expect(fetchImage).toHaveBeenCalledWith('https://cdn.example.com/a.png?size=2');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(assets.get(node)).toEqual({ data: png, width: 200, height: 100 });
  });

  it('rejects with the reason when fetchImage fails', async () => {
    const fetchImage = vi.fn(() => Promise.reject(new Error('not on the allow-list')));
    const load = loadImages(root(imageNode('https://evil.test/a.png')), writer, undefined, {
      fetchImage,
    });
    await expect(load).rejects.toThrow(
      'ngpdf: could not load image "https://evil.test/a.png": not on the allow-list',
    );
  });

  it.each(['/logo.png', 'logo.png', '//cdn.example.com/a.png'])(
    'refuses the relative URL %s, even with fetchImage',
    async (src) => {
      const fetchImage = vi.fn(() => Promise.resolve(png));
      const load = loadImages(root(imageNode(src)), writer, undefined, { fetchImage });
      await expect(load).rejects.toThrow(`ngpdf: relative image URL "${src}" on the server`);
      expect(fetchImage).not.toHaveBeenCalled();
    },
  );

  it.each(['file:///etc/passwd', 'ftp://host/a.png', 'localhost:3000/a.png', 'C:\\logo.png'])(
    'refuses %s, which is not http or https, before fetchImage sees it',
    async (src) => {
      const fetchImage = vi.fn(() => Promise.resolve(png));
      const load = loadImages(root(imageNode(src)), writer, undefined, { fetchImage });
      await expect(load).rejects.toThrow(
        `ngpdf: image URL "${src}" is not http or https; the server reads no other scheme`,
      );
      expect(fetchImage).not.toHaveBeenCalled();
    },
  );

  it('passes an http URL and an upper-case HTTPS one to fetchImage', async () => {
    const fetchImage = vi.fn(() => Promise.resolve(png));
    await loadImages(
      root(imageNode('http://cdn.example.com/a.png'), imageNode('HTTPS://cdn.example.com/b.png')),
      writer,
      undefined,
      { fetchImage },
    );
    expect(fetchImage).toHaveBeenCalledWith('http://cdn.example.com/a.png');
    expect(fetchImage).toHaveBeenCalledWith('HTTPS://cdn.example.com/b.png');
  });

  it('still loads data URLs, Blobs and ArrayBuffers', async () => {
    const nodes = [
      imageNode(dataUrl),
      imageNode(new Blob([png as BlobPart])),
      imageNode(png.buffer.slice(0)),
    ];
    const assets = await loadImages(root(...nodes), writer, undefined, {});
    for (const node of nodes) expect(assets.get(node)?.width).toBe(200);
  });
});
