import { describe, expect, it, vi } from 'vitest';
import { createNode, type PdfNode } from '../../tree/node';
import type { Color } from '../color';
import { loadSvgs, MAX_SVG_BYTES } from './load';

const LOGO = '<svg viewBox="0 0 20 10"><rect width="20" height="10" fill="currentColor"/></svg>';
const BLUE: Color = { r: 0, g: 0, b: 255, a: 1 };

function svgNode(src: unknown): PdfNode {
  const node = createNode('element', 'pdf-svg');
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

const noWarn = (): void => undefined;
const fillOf = (ops: readonly { op: string }[] | undefined): unknown =>
  (ops?.find((op) => op.op === 'shape') as { fill?: { color: string } } | undefined)?.fill?.color;

describe('loadSvgs', () => {
  it('parses markup, drawn with each element’s own color', async () => {
    const [a, b] = [svgNode(LOGO), svgNode(`  \n${LOGO}`)];
    const styles = new Map([[a, { color: BLUE }]]);
    const { svgs } = await loadSvgs(root(a, b), styles, noWarn);
    expect(svgs.get(a)).toMatchObject({ width: 20, height: 10 });
    expect(fillOf(svgs.get(a)?.ops)).toBe('#0000ff');
    // No style: black, the initial color.
    expect(fillOf(svgs.get(b)?.ops)).toBe('#000000');
  });

  it('reads data URLs, percent-encoded and base64, as UTF-8', async () => {
    const percent = svgNode(
      `data:image/svg+xml,${encodeURIComponent(LOGO.replace('20" height="10"', '20" height="10" id="ç"'))}`,
    );
    const base64 = svgNode(`data:image/svg+xml;base64,${btoa(LOGO)}`);
    const { svgs } = await loadSvgs(root(percent, base64), new Map(), noWarn);
    expect(svgs.get(percent)?.width).toBe(20);
    expect(svgs.get(base64)?.width).toBe(20);
  });

  it('reads a Blob and fetches a URL once for every element that uses it', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(LOGO)));
    const [a, b, c] = [svgNode('/logo.svg'), svgNode('/logo.svg'), svgNode(new Blob([LOGO]))];
    const { svgs, loads } = await loadSvgs(root(a, b, c), new Map(), noWarn, fetchFn);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect([a, b, c].map((node) => svgs.get(node)?.width)).toEqual([20, 20, 20]);
    // A later call given these loads reads nothing again.
    const again = await loadSvgs(
      root(svgNode('/logo.svg')),
      new Map(),
      noWarn,
      fetchFn,
      undefined,
      undefined,
      loads,
    );
    expect(again.loads.size).toBe(0);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('names the source when a read fails', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response('', { status: 404 })));
    await expect(
      loadSvgs(root(svgNode('/a.svg?token=1')), new Map(), noWarn, fetchFn),
    ).rejects.toThrow('ngpdf: could not load SVG "/a.svg": HTTP 404');
    await expect(loadSvgs(root(svgNode(42)), new Map(), noWarn)).rejects.toThrow(
      'ngpdf: could not load SVG "number": src must be SVG markup, a URL or a Blob',
    );
  });

  it('caps fetched URLs at maxBytes', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(LOGO)));
    await expect(
      loadSvgs(root(svgNode('/a.svg')), new Map(), noWarn, fetchFn, undefined, 10),
    ).rejects.toThrow('ngpdf: could not load SVG "/a.svg": larger than 10 bytes');
  });

  it('never reads a URL or a Blob past the SVG limit, whatever maxImageBytes allows', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(' '.repeat(MAX_SVG_BYTES + 1))));
    await expect(loadSvgs(root(svgNode('/big.svg')), new Map(), noWarn, fetchFn)).rejects.toThrow(
      `ngpdf: could not load SVG "/big.svg": larger than ${String(MAX_SVG_BYTES)} bytes`,
    );
    const blob = new Blob([' '.repeat(MAX_SVG_BYTES + 1)]);
    const read = vi.spyOn(blob, 'arrayBuffer');
    await expect(loadSvgs(root(svgNode(blob)), new Map(), noWarn)).rejects.toThrow(
      `ngpdf: pdf-svg source is larger than ${String(MAX_SVG_BYTES)} bytes`,
    );
    expect(read).not.toHaveBeenCalled();
  });

  it('reads URLs on the server only through fetchImage', async () => {
    await expect(
      loadSvgs(root(svgNode('https://example.com/a.svg')), new Map(), noWarn, undefined, {}),
    ).rejects.toThrow(
      'ngpdf: remote SVG "https://example.com/a.svg" refused on the server; pass fetchImage',
    );
    const fetchImage = vi.fn(() => Promise.resolve(new TextEncoder().encode(LOGO)));
    const { svgs } = await loadSvgs(
      root(svgNode('https://example.com/a.svg')),
      new Map(),
      noWarn,
      undefined,
      {
        fetchImage,
      },
    );
    expect([...svgs.values()][0]?.width).toBe(20);
  });

  describe(`throws past ${String(MAX_SVG_BYTES)} bytes of source`, () => {
    const big = (bytes: number): string => `<svg>${' '.repeat(bytes - 11)}</svg>`;
    const message = `ngpdf: pdf-svg source is larger than ${String(MAX_SVG_BYTES)} bytes`;

    it('in markup, counted in UTF-8', async () => {
      await expect(
        loadSvgs(root(svgNode(big(MAX_SVG_BYTES))), new Map(), noWarn),
      ).resolves.toBeDefined();
      await expect(
        loadSvgs(root(svgNode(big(MAX_SVG_BYTES + 1))), new Map(), noWarn),
      ).rejects.toThrow(message);
      // Half as many characters, each two bytes in UTF-8.
      const wide = `<svg id="${'é'.repeat(MAX_SVG_BYTES / 2)}"/>`;
      await expect(loadSvgs(root(svgNode(wide)), new Map(), noWarn)).rejects.toThrow(message);
    });

    it('in bytes decoded from a data URL', async () => {
      const url = `data:image/svg+xml;base64,${btoa(big(MAX_SVG_BYTES + 1))}`;
      await expect(loadSvgs(root(svgNode(url)), new Map(), noWarn)).rejects.toThrow(message);
    });
  });

  it('passes on parse errors as they are', async () => {
    await expect(loadSvgs(root(svgNode('<svg>')), new Map(), noWarn)).rejects.toThrow(
      'ngpdf: invalid SVG: unclosed <svg> at 5',
    );
  });
});
