import { deflateSync } from 'node:zlib';

/** A PNG chunk. png-js and pdfkit skip the CRC, so it is left at zero. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export interface TestPng {
  readonly width?: number;
  readonly height?: number;
  /** 2 for RGB, 3 for a palette (with a `tRNS`), 4 for gray with alpha, 6 for RGBA. */
  readonly colorType?: 2 | 3 | 4 | 6;
  /** The IDAT payload; by default the zlib stream of every row, each with filter byte 0. */
  readonly idat?: Uint8Array;
  /** Leave out the IEND chunk, as a cut-off file does. */
  readonly noEnd?: boolean;
  /** Mark it Adam7-interlaced; pass a matching `idat`. */
  readonly interlaced?: boolean;
}

const CHANNELS = { 2: 3, 3: 1, 4: 2, 6: 4 } as const;

/** A small 8-bit PNG built for tests, with every part replaceable to make it broken. */
export function testPng(options: TestPng = {}): Uint8Array {
  const { width = 2, height = 2, colorType = 6 } = options;
  const channels = CHANNELS[colorType];
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, colorType, 0, 0, options.interlaced ? 1 : 0], 8);
  const rows = new Uint8Array(height * (1 + width * channels)).fill(200);
  for (let row = 0; row < height; row++) rows[row * (1 + width * channels)] = 0;
  const idat = options.idat ?? new Uint8Array(deflateSync(rows));
  return concat([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    // Every pixel is index 200: a palette of 256 black entries, the first one transparent, so
    // pdfkit has to decode the pixels to build the alpha mask.
    ...(colorType === 3
      ? [chunk('PLTE', new Uint8Array(256 * 3)), chunk('tRNS', Uint8Array.of(0))]
      : []),
    chunk('IDAT', idat),
    ...(options.noEnd ? [] : [chunk('IEND', new Uint8Array())]),
  ]);
}

/**
 * The pixel data of `testPng(options)` compressed, for building a variant of it. `filter` is every
 * row's filter byte; png-js throws on one above 4.
 */
export function testRows(
  width = 2,
  height = 2,
  channels = 4,
  count = height,
  filter = 0,
): Uint8Array {
  const rows = new Uint8Array(count * (1 + width * channels)).fill(200);
  for (let row = 0; row < count; row++) rows[row * (1 + width * channels)] = filter;
  return new Uint8Array(deflateSync(rows));
}

/** `length` zero bytes, compressed: pixel data of a given size, every filter byte 0. */
export function testZeros(length: number): Uint8Array {
  return new Uint8Array(deflateSync(new Uint8Array(length)));
}
