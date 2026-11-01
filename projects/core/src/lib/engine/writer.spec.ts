import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createPdfkitWriter,
  type DocumentInfo,
  type DrawOp,
  type FontName,
  type PdfWriter,
  type StandardFont,
} from './writer';
import { testFont } from '../../testing/test-fonts';

/** 3x2 8-bit grayscale PNG, generated so no binary file sits in the repo. */
function tinyPng(): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: number[]) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (type: string, data: number[]) => {
    const body = Array.from(type, (ch) => ch.charCodeAt(0)).concat(data);
    return [...u32(data.length), ...body, ...u32(crc(body))];
  };
  // zlib stream of two filter-0 rows (3 bytes each), stored (uncompressed) block.
  const raw = [0, 10, 100, 200, 0, 30, 60, 90];
  const adler = (() => {
    let a = 1;
    let b = 0;
    for (const v of raw) {
      a = (a + v) % 65521;
      b = (b + a) % 65521;
    }
    return u32(((b << 16) | a) >>> 0);
  })();
  const len = raw.length;
  const zlib = [
    0x78,
    0x01,
    1,
    len & 255,
    len >> 8,
    ~len & 255,
    (~len >> 8) & 255,
    ...raw,
    ...adler,
  ];
  const ihdr = [...u32(3), ...u32(2), 8, 0, 0, 0, 0];
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', zlib),
    ...chunk('IEND', []),
  ]);
}

/**
 * A baseline grayscale JPEG of `width`x`height`, flat grey, with an Exif APP1 segment whose IFD0
 * holds only the Orientation tag. Each 8x8 block is a zero DC difference and an end of block, both
 * coded as the one-bit code `0`, so the file decodes without any pixel data in the repo.
 */
function orientedJpeg(
  width: number,
  height: number,
  orientation: number,
  options: { order?: 'MM' | 'II'; jfif?: boolean; type?: 1 | 3 | 4; before?: number[] } = {},
): Uint8Array {
  const big = options.order !== 'II';
  const u16 = (n: number) => (big ? [n >> 8, n & 255] : [n & 255, n >> 8]);
  const u32 = (n: number) =>
    big ? [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255] : [...u16(n & 0xffff), 0, 0];
  const segment = (marker: number, body: number[]) => [
    0xff,
    marker,
    (body.length + 2) >> 8,
    (body.length + 2) & 255,
    ...body,
  ];
  const tiff = [
    ...(big ? [0x4d, 0x4d] : [0x49, 0x49]),
    ...u16(42),
    ...u32(8),
    ...u16(2),
    // An unrelated tag first (ImageDescription, empty), so the reader has to look past it.
    ...u16(0x010e),
    ...u16(2),
    ...u32(0),
    ...u32(0),
    ...u16(0x0112),
    ...u16(options.type ?? 3),
    ...u32(1),
    ...(options.type === 4
      ? u32(orientation)
      : options.type === 1
        ? [orientation, 0, 0, 0]
        : [...u16(orientation), 0, 0]),
    ...u32(0),
  ];
  const exif = segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
  const jfif = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const oneSymbolTable = (tableClass: number) =>
    segment(0xc4, [tableClass << 4, 1, ...Array<number>(15).fill(0), 0]);
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
  const scan = Array<number>(Math.ceil((blocks * 2) / 8)).fill(0);
  const spareBits = scan.length * 8 - blocks * 2;
  if (spareBits > 0) scan[scan.length - 1] = (1 << spareBits) - 1;
  return new Uint8Array([
    0xff,
    0xd8,
    ...(options.jfif ? jfif : []),
    ...(options.before ?? []),
    ...exif,
    ...segment(0xdb, [0, ...Array<number>(64).fill(1)]),
    ...segment(0xc0, [8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]),
    ...oneSymbolTable(0),
    ...oneSymbolTable(1),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    ...scan,
    0xff,
    0xd9,
  ]);
}

type Matrix = readonly [number, number, number, number, number, number];

/** Where the unit square of the first image XObject lands, from the `cm`s in an uncompressed page. */
function imagePlacement(pdf: string): (u: number, v: number) => [number, number] {
  const page = pdf.slice(0, pdf.indexOf('/I1 Do'));
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const saved: Matrix[] = [];
  for (const [token, args = ''] of page.matchAll(/((?:-?[\d.]+ ){6})cm|\bq\b|\bQ\b/g)) {
    if (token === 'q') saved.push(ctm);
    else if (token === 'Q') ctm = saved.pop() ?? ctm;
    else {
      const [a, b, c, d, e, f] = args.trim().split(' ').map(Number) as unknown as Matrix;
      const [A, B, C, D, E, F] = ctm;
      ctm = [
        a * A + b * C,
        a * B + b * D,
        c * A + d * C,
        c * B + d * D,
        e * A + f * C + E,
        e * B + f * D + F,
      ];
    }
  }
  const [a, b, c, d, e, f] = ctm;
  return (u, v) => [a * u + c * v + e, b * u + d * v + f];
}

const A4 = { width: 595.28, height: 841.89 };
const SQUARE = { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
const info = {
  title: 'Quarterly report',
  creationDate: new Date('2026-01-02T03:04:05Z'),
  producer: 'ngpdf',
};

function infoString(pdf: string, key: 'Creator' | 'Producer'): string | undefined {
  const reference = (
    key === 'Creator' ? /\/Creator\s+(\d+)\s+0\s+R/ : /\/Producer\s+(\d+)\s+0\s+R/
  ).exec(pdf);
  if (!reference) return undefined;
  const object = new RegExp(
    `\\b${reference[1] ?? ''}\\s+0\\s+obj\\s*\\((.*?)\\)\\s+endobj`,
    's',
  ).exec(pdf);
  return object?.[1];
}

describe('createPdfkitWriter', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });

  it('measures text with the standard font metrics', () => {
    expect(writer.widthOf('Hello', 'Helvetica', 10)).toBeCloseTo(22.78, 2);
    expect(writer.widthOf('Hello', 'Courier', 10)).toBeCloseTo(30, 2);
  });

  it('measures and draws each of the twelve standard fonts', async () => {
    // pdfkit's browser build knows only the fonts registered with registerStdFonts().
    const fonts: StandardFont[] = [
      'Helvetica',
      'Helvetica-Bold',
      'Helvetica-Oblique',
      'Helvetica-BoldOblique',
      'Times-Roman',
      'Times-Bold',
      'Times-Italic',
      'Times-BoldItalic',
      'Courier',
      'Courier-Bold',
      'Courier-Oblique',
      'Courier-BoldOblique',
    ];
    const ops: DrawOp[] = fonts.map((font, i) => ({
      op: 'text',
      x: 10,
      y: 10 + i * 20,
      text: 'Ag',
      font,
      size: 12,
      color: '#000',
      opacity: 1,
      underline: false,
      strike: false,
    }));
    for (const font of fonts) {
      expect(writer.widthOf('Ag', font, 12)).toBeGreaterThan(0);
      expect(writer.ascent(font, 12)).toBeGreaterThan(0);
    }
    const blob = await writer.write([{ ...A4, ops }], info);
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    for (const font of fonts) expect(text).toContain(`/BaseFont /${font}\n`);
  });

  it('reports a positive ascent that scales with size', () => {
    const ascent = writer.ascent('Helvetica', 10);
    expect(ascent).toBeGreaterThan(0);
    expect(ascent).toBeLessThan(10);
    expect(writer.ascent('Helvetica', 20)).toBeCloseTo(ascent * 2, 5);
  });

  it('writes a PDF blob with a rect and a text op', async () => {
    const ops: DrawOp[] = [
      {
        op: 'rect',
        x: 10,
        y: 10,
        w: 100,
        h: 50,
        radii: { topLeft: 4, topRight: 4, bottomRight: 4, bottomLeft: 4 },
        fill: '#ff0000',
        opacity: 0.5,
      },
      {
        op: 'text',
        x: 20,
        y: 20,
        text: 'Hello PDF',
        font: 'Helvetica-Bold',
        size: 12,
        color: '#000000',
        opacity: 1,
        underline: true,
        strike: false,
      },
    ];
    const blob = await writer.write([{ ...A4, ops }], info);
    expect(blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Quarterly report');
    expect(text).toContain('Helvetica-Bold');
    // Standard-font text is written as hex inside a TJ array.
    expect(text).toContain('<48656c6c6f20504446>');
  });

  it('writes document language, creator, producer and viewer preferences', async () => {
    const blob = await writer.write([{ ...A4, ops: [] }], {
      ...info,
      language: 'en-US',
      creator: 'Report App',
      producer: 'ngpdf',
      pageMode: 'FullScreen',
      pageLayout: 'TwoColumnLeft',
    });
    const pdf = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(pdf).toContain('/Lang (en-US)');
    expect(infoString(pdf, 'Creator')).toBe('Report App');
    expect(infoString(pdf, 'Producer')).toBe('ngpdf');
    expect(pdf).toContain('/PageMode /FullScreen');
    expect(pdf).toContain('/PageLayout /TwoColumnLeft');
  });

  it('omits an unset creator', async () => {
    const blob = await writer.write([{ ...A4, ops: [] }], { ...info });
    const pdf = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(infoString(pdf, 'Producer')).toBe('ngpdf');
    expect(infoString(pdf, 'Creator')).toBeUndefined();
  });

  it('draws lines, strike text, images and one page per entry', async () => {
    const png = tinyPng();
    const ops: DrawOp[] = [
      { op: 'line', x1: 0, y1: 0, x2: 50, y2: 50, width: 2, color: '#00f', opacity: 1 },
      {
        op: 'text',
        x: 0,
        y: 0,
        text: 'gone',
        font: 'Courier',
        size: 9,
        color: '#333',
        opacity: 0.4,
        underline: false,
        strike: true,
      },
      {
        op: 'image',
        x: 5,
        y: 5,
        w: 30,
        h: 20,
        clip: { x: 5, y: 5, w: 20, h: 20 },
        data: png,
      },
    ];
    const blob = await writer.write(
      [
        { width: 200, height: 200, ops },
        { width: 100, height: 100, ops: [] },
      ],
      { ...info, author: 'A', subject: 'S', keywords: ['k1', 'k2'] },
    );
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(2);
    expect(text).toContain('/Subtype /Image');
    expect(text).toContain('k1, k2');
  });

  it('produces identical bytes for identical input', async () => {
    const pages = [{ ...A4, ops: [] as DrawOp[] }];
    const a = new Uint8Array(await (await writer.write(pages, info)).arrayBuffer());
    const b = new Uint8Array(await (await writer.write(pages, info)).arrayBuffer());
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('compresses streams by default', async () => {
    const compressed = await createPdfkitWriter();
    const ops: DrawOp[] = [
      { op: 'rect', x: 0, y: 0, w: 5, h: 5, radii: SQUARE, fill: '#000', opacity: 1 },
    ];
    const blob = await compressed.write([{ ...A4, ops }], info);
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain('/FlateDecode');
  });

  it('reads PNG sizes and rejects other bytes', () => {
    expect(writer.imageSize(tinyPng())).toEqual({ width: 3, height: 2 });
    expect(() => writer.imageSize(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it('reads JPEG sizes from the SOF marker', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x07,
      0x00, 0x09, 0x01, 0x01, 0x11, 0x00,
    ]);
    expect(writer.imageSize(jpeg)).toEqual({ width: 9, height: 7 });
    expect(() => writer.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toThrow();
  });

  it('swaps a JPEG size for EXIF orientations 5 to 8, as browsers display it', () => {
    for (const orientation of [1, 2, 3, 4]) {
      expect(writer.imageSize(orientedJpeg(40, 20, orientation))).toEqual({
        width: 40,
        height: 20,
      });
    }
    for (const orientation of [5, 6, 7, 8]) {
      expect(writer.imageSize(orientedJpeg(40, 20, orientation))).toEqual({
        width: 20,
        height: 40,
      });
    }
    expect(writer.imageSize(orientedJpeg(40, 20, 6, { order: 'II' }))).toEqual({
      width: 20,
      height: 40,
    });
    expect(writer.imageSize(orientedJpeg(40, 20, 6, { jfif: true }))).toEqual({
      width: 20,
      height: 40,
    });
    // pdfkit reads the value as a SHORT whatever the type: a little-endian BYTE or LONG of 8 starts
    // with the bytes of SHORT 8, a big-endian one does not.
    for (const type of [1, 4] as const) {
      expect(writer.imageSize(orientedJpeg(40, 20, 8, { type, order: 'II' }))).toEqual({
        width: 20,
        height: 40,
      });
      expect(writer.imageSize(orientedJpeg(40, 20, 8, { type, order: 'MM' }))).toEqual({
        width: 40,
        height: 20,
      });
    }
    // An APP1 that is not Exif (XMP) or a comment before the Exif APP1 is skipped, not a stop.
    const xmp = [0xff, 0xe1, 0x00, 0x0a, ...Array.from('http://', (ch) => ch.charCodeAt(0)), 0];
    const comment = [0xff, 0xfe, 0x00, 0x04, 0x68, 0x69];
    for (const before of [xmp, comment]) {
      expect(writer.imageSize(orientedJpeg(40, 20, 6, { before }))).toEqual({
        width: 20,
        height: 40,
      });
    }
  });

  it('ignores an orientation that pdfkit would not read either', () => {
    const exif = [0x45, 0x78, 0x69, 0x66, 0, 0];
    const app1 = (tiff: number[]) => [0xff, 0xe1, 0x00, 8 + tiff.length, ...exif, ...tiff];
    const entry = (value: number) => [0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, value, 0, 0];
    const withApp1 = (tiff: number[]) =>
      new Uint8Array([0xff, 0xd8, ...app1(tiff), ...orientedJpeg(40, 20, 1).subarray(2)]);
    for (const tiff of [
      // An unknown byte order, and a TIFF magic number other than 42.
      [0x58, 0x58, 0, 42, 0, 0, 0, 8, 0, 1, ...entry(6)],
      [0x4d, 0x4d, 0, 43, 0, 0, 0, 8, 0, 1, ...entry(6)],
      // An IFD offset past the end of the file.
      [0x4d, 0x4d, 0, 42, 0x7f, 0, 0, 0],
      // An orientation outside 1 to 8.
      [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, ...entry(0)],
      [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, ...entry(9)],
      // An IFD with no Orientation entry: the later Exif APP1 is not read.
      [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 0],
    ]) {
      expect(writer.imageSize(withApp1(tiff))).toEqual({ width: 40, height: 20 });
    }
    // Entries counted past the end of the file, a TIFF header cut short by the end of the file, an
    // Exif APP1 after the scan starts, and a file too short to hold one.
    const cutEntries = new Uint8Array([0xff, 0xd8, ...app1([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 9])]);
    const cutHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 12, ...exif, 0x4d, 0x4d, 0, 42]);
    const sos = [0xff, 0xda, 0x00, 0x02];
    const late = orientedJpeg(40, 20, 6, { before: sos });
    expect(() => writer.imageSize(cutEntries)).toThrow(/frame/);
    expect(() => writer.imageSize(cutHeader)).toThrow(/frame/);
    expect(() => writer.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toThrow(/frame/);
    expect(writer.imageSize(late)).toEqual({ width: 40, height: 20 });
    // A TIFF header cut short in a file long enough to scan, and no marker before the end.
    const app0 = [0xff, 0xe0, 0x00, 0x06, 0, 0, 0, 0];
    const cutLate = [0xff, 0xd8, ...app0, 0xff, 0xe1, 0, 12, ...exif, 0x4d, 0x4d, 0, 42];
    expect(() => writer.imageSize(new Uint8Array(cutLate))).toThrow(/frame/);
    expect(() =>
      writer.imageSize(new Uint8Array([0xff, 0xd8, ...Array<number>(20).fill(0)])),
    ).toThrow(/marker/);
    // A standalone RST marker before the Exif APP1 has no length to skip.
    expect(writer.imageSize(orientedJpeg(40, 20, 6, { before: [0xff, 0xd0] }))).toEqual({
      width: 20,
      height: 40,
    });
  });

  it.each([5, 6, 7, 8])(
    'fills the laid-out box with a JPEG of orientation %i, the way browsers rotate it',
    async (orientation) => {
      const jpeg = orientedJpeg(40, 20, orientation);
      const { width: w, height: h } = writer.imageSize(jpeg);
      const clip = { x: 0, y: 0, w: 100, h: 100 };
      const ops: DrawOp[] = [{ op: 'image', x: 10, y: 20, w, h, clip, data: jpeg }];
      const blob = await writer.write([{ width: 100, height: 100, ops }], info);
      const place = imagePlacement(new TextDecoder('latin1').decode(await blob.arrayBuffer()));
      // PDF space has y up; the box is x 10..30 and y 20..60 from the top of a 100pt page.
      const corners = [place(0, 0), place(1, 0), place(0, 1), place(1, 1)].map(
        ([x, y]) => [Math.round(x), Math.round(100 - y)] as const,
      );
      expect(new Set(corners.map(([x]) => x))).toEqual(new Set([10, 30]));
      expect(new Set(corners.map(([, y]) => y))).toEqual(new Set([20, 60]));
      // The stored image's top-left corner (u 0, v 1) goes where the orientation says.
      const topLeft = { 5: [10, 20], 6: [30, 20], 7: [30, 60], 8: [10, 60] }[orientation];
      expect(corners[2]).toEqual(topLeft);
    },
  );

  it('lays out a JPEG at the turn pdfkit draws it with, so it keeps its aspect ratio', async () => {
    const xmp = [0xff, 0xe1, 0x00, 0x0a, ...Array.from('http://', (ch) => ch.charCodeAt(0)), 0];
    const comment = [0xff, 0xfe, 0x00, 0x04, 0x68, 0x69];
    const undefinedType = orientedJpeg(40, 20, 1);
    // The Orientation entry's type is the last 2 bytes before its count (00 00 00 01) and value.
    const entry = undefinedType.findIndex(
      (_, i) => undefinedType[i] === 0x01 && undefinedType[i + 1] === 0x12,
    );
    undefinedType[entry + 3] = 7;
    undefinedType[entry + 9] = 6;
    const jpegs = [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((orientation) => orientedJpeg(40, 20, orientation)),
      orientedJpeg(40, 20, 6, { order: 'II' }),
      orientedJpeg(40, 20, 6, { jfif: true }),
      orientedJpeg(40, 20, 6, { before: xmp }),
      orientedJpeg(40, 20, 6, { before: comment }),
      orientedJpeg(40, 20, 6, { before: [0xff, 0xda, 0x00, 0x02] }),
      ...([1, 4] as const).flatMap((type) =>
        (['MM', 'II'] as const).map((order) => orientedJpeg(40, 20, 8, { type, order })),
      ),
      undefinedType,
    ];
    for (const [i, jpeg] of jpegs.entries()) {
      const { width: w, height: h } = writer.imageSize(jpeg);
      const clip = { x: 0, y: 0, w: 100, h: 100 };
      const ops: DrawOp[] = [{ op: 'image', x: 10, y: 20, w, h, clip, data: jpeg }];
      const blob = await writer.write([{ width: 100, height: 100, ops }], info);
      const place = imagePlacement(new TextDecoder('latin1').decode(await blob.arrayBuffer()));
      const [x0, y0] = place(0, 0);
      const [xu, yu] = place(1, 0);
      const [xv, yv] = place(0, 1);
      // One stored pixel spans as many points along the stored width (40) as along its height (20).
      const perPixelU = Math.hypot(xu - x0, yu - y0) / 40;
      const perPixelV = Math.hypot(xv - x0, yv - y0) / 20;
      expect(perPixelU / perPixelV, `JPEG ${String(i)}`).toBeCloseTo(1, 6);
    }
  });

  it('rejects malformed PNG and JPEG headers', () => {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    expect(() => writer.imageSize(new Uint8Array(sig))).toThrow(/PNG/);
    expect(() => writer.imageSize(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00]))).toThrow(/JPEG/);
    // Fill byte, standalone RESTART marker, a zero-length segment, then nothing useful.
    expect(() =>
      writer.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xff, 0xd0, 0xff, 0xe0, 0x00, 0x00])),
    ).toThrow(/JPEG/);
    // Frame marker cut short before the size bytes.
    expect(() => writer.imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b]))).toThrow(
      /JPEG/,
    );
  });

  it('draws a square-cornered rect without rounding', async () => {
    const ops: DrawOp[] = [
      { op: 'rect', x: 1, y: 1, w: 9, h: 9, radii: SQUARE, fill: '#0f0', opacity: 1 },
    ];
    const blob = await writer.write([{ width: 20, height: 20, ops }], info);
    expect(blob.size).toBeGreaterThan(0);
  });

  describe('content stream', () => {
    const TEXT_OP: DrawOp = {
      op: 'text',
      x: 10,
      y: 10,
      text: 'decorated',
      font: 'Helvetica',
      size: 12,
      color: '#000000',
      opacity: 0.4,
      underline: true,
      strike: true,
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function pdfText(ops: DrawOp[]): Promise<string> {
      const blob = await writer.write([{ width: 200, height: 200, ops }], info);
      return new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    }

    /** Page content streams only: the ones that open a graphics state. */
    function contentOf(pdf: string): string {
      return [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
        .map((match) => match[1] ?? '')
        .filter((body) => /^q$/m.test(body))
        .join('\n');
    }

    const count = (haystack: string, pattern: RegExp) => haystack.match(pattern)?.length ?? 0;

    it('rejects, instead of throwing synchronously, on an unknown op', async () => {
      const bad = { op: 'blob' } as unknown as DrawOp;
      let pending: Promise<Blob> | undefined;
      expect(() => {
        pending = writer.write([{ ...A4, ops: [bad] }], info);
      }).not.toThrow();
      await expect(pending).rejects.toThrow('ngpdf: unhandled draw op {"op":"blob"}');
    });

    it('leaves no unhandled rejection after a failed write', async () => {
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        const bad = { op: 'blob' } as unknown as DrawOp;
        await expect(writer.write([{ ...A4, ops: [bad] }], info)).rejects.toThrow(/unhandled/);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });

    it('draws a rounded rect with curve operators and a square one without', async () => {
      const rect = { op: 'rect', x: 10, y: 10, w: 80, h: 40, fill: '#ff0000', opacity: 1 } as const;
      const rounded = contentOf(
        await pdfText([
          { ...rect, radii: { topLeft: 6, topRight: 6, bottomRight: 6, bottomLeft: 6 } },
        ]),
      );
      expect(count(rounded, /\sc\n/g)).toBe(4);
      expect(rounded).toMatch(/\nf\n/);
      // One curve per rounded corner; a square corner is a plain vertex.
      const mixed = contentOf(
        await pdfText([
          { ...rect, radii: { topLeft: 6, topRight: 0, bottomRight: 3, bottomLeft: 0 } },
        ]),
      );
      expect(count(mixed, /\sc\n/g)).toBe(2);
      expect(mixed).toMatch(/\n16 10 m\n/);
      expect(mixed).toContain('90 10 l');
      expect(mixed).toContain('10 50 l');
      expect(mixed).toMatch(/\nh\nf\n/);
      const square = contentOf(
        await pdfText([
          { op: 'rect', x: 10, y: 10, w: 80, h: 40, radii: SQUARE, fill: '#ff0000', opacity: 1 },
        ]),
      );
      expect(square).toContain('10 10 80 40 re');
      expect(count(square, /\sc\n/g)).toBe(0);
    });

    it('writes a link as a borderless Link annotation with a URI action', async () => {
      const pdf = await pdfText([
        {
          op: 'link',
          x: 10,
          y: 20,
          w: 30,
          h: 40,
          kind: 'uri',
          url: 'https://example.com/a?b=(c)',
        },
      ]);
      expect(pdf).toContain('/Subtype /Link');
      expect(pdf).toContain('/Border [0 0 0]');
      // y is flipped: the page is 200 tall.
      expect(pdf).toContain('/Rect [10 140 40 180]');
      expect(pdf).toContain('/S /URI');
      expect(pdf).toContain(String.raw`/URI (https://example.com/a?b=\(c\))`);
      expect(pdf).toMatch(/\/Annots \[\d+ 0 R\]/);
      // A link draws nothing.
      expect(contentOf(pdf)).not.toContain(' re\n');
    });

    it('writes a link in page space, whatever transform or clip it sits in', async () => {
      const link = {
        op: 'link',
        x: 10,
        y: 20,
        w: 30,
        h: 40,
        kind: 'uri',
        url: 'https://example.com/',
      } as const;
      const pdf = await pdfText([
        { op: 'transform', matrix: [0, 1, -1, 0, 100, 50] },
        { op: 'clip', x: 0, y: 0, w: 5, h: 5, radii: SQUARE },
        link,
        { op: 'unclip' },
        { op: 'untransform' },
        link,
      ]);
      expect(pdf.match(/\/Rect \[10 140 40 180\]/g)).toHaveLength(2);
    });

    describe('notes', () => {
      const NOTE = {
        op: 'note',
        x: 10,
        y: 10,
        text: 'Check this (total)',
        icon: 'key',
        color: '#00aa77',
        open: true,
      } as const;

      /** The dictionary of each Text annotation in the file. */
      function notesIn(pdf: string): string[] {
        return pdf.split('endobj').filter((body) => body.includes('/Subtype /Text'));
      }

      /**
       * A PDF text string as pdfkit writes one outside PDFDocEncoding, UTF-16BE after FE FF, decoded
       * as `pdfText` decodes the file.
       */
      function utf16(text: string): string {
        const bytes = [0xfe, 0xff];
        for (let i = 0; i < text.length; i++) {
          const unit = text.charCodeAt(i);
          bytes.push(unit >> 8, unit & 0xff);
        }
        return new TextDecoder('latin1').decode(new Uint8Array(bytes));
      }

      it('writes a Text annotation with contents, author, icon, color and open flag', async () => {
        const pdf = await pdfText([{ ...NOTE, author: 'Ana' }]);
        const [note, ...rest] = notesIn(pdf);
        expect(rest).toEqual([]);
        expect(note).toContain(String.raw`/Contents (Check this \(total\))`);
        expect(note).toContain('/T (Ana)');
        expect(note).toContain('/Name /Key');
        expect(note).toContain('/Open true');
        expect(note).toMatch(/\/C \[0 0\.666\d* 0\.466\d*\]/);
        // 20pt square from (10, 10), y flipped: the page is 200 tall.
        expect(note).toContain('/Rect [10 170 30 190]');
        expect(pdf).toMatch(/\/Annots \[\d+ 0 R\]/);
        // A note draws nothing.
        expect(contentOf(pdf)).toBe('');
      });

      it('writes text outside WinAnsi as UTF-16BE PDF strings', async () => {
        const pdf = await pdfText([{ ...NOTE, text: 'Łódź → 日本 ✓', author: 'Zoë' }]);
        const [note] = notesIn(pdf);
        expect(note).toContain(`/Contents (${utf16('Łódź → 日本 ✓')})`);
        expect(note).toContain(`/T (${utf16('Zoë')})`);
      });

      it('maps each icon to its standard name', async () => {
        const icons = {
          comment: 'Comment',
          note: 'Note',
          help: 'Help',
          key: 'Key',
          insert: 'Insert',
          paragraph: 'Paragraph',
          'new-paragraph': 'NewParagraph',
        } as const;
        const pdf = await pdfText(
          Object.keys(icons).map((icon) => ({ ...NOTE, icon: icon as keyof typeof icons })),
        );
        const names = notesIn(pdf).map((note) => /\/Name \/(\w+)/.exec(note)?.[1]);
        expect(names).toEqual(Object.values(icons));
      });

      it('writes no title without an author, a closed note, and never the Print flag', async () => {
        const pdf = await pdfText([{ ...NOTE, open: false }]);
        const [note] = notesIn(pdf);
        expect(note).not.toContain('/T ');
        expect(note).toContain('/Open false');
        // No /F at all: annotation flags default to 0, so viewers don't print the note.
        expect(note).not.toMatch(/\/F\b/);
        expect(note).not.toContain('/A ');
      });

      it('writes the notes of a page before its links, so a link is on top where they overlap', async () => {
        const link = {
          op: 'link',
          x: 10,
          y: 10,
          w: 100,
          h: 12,
          kind: 'uri',
          url: 'https://example.com/',
        } as const;
        const pdf = await pdfText([link, NOTE]);
        const annots = /\/Annots \[([^\]]*)\]/.exec(pdf)?.[1] ?? '';
        const refs = [...annots.matchAll(/(\d+) 0 R/g)].map((match) => match[1]);
        const subtype = (ref: string | undefined): string | undefined =>
          new RegExp(`\\n${ref ?? ''} 0 obj\\n<<[^]*?/Subtype /(\\w+)`).exec(pdf)?.[1];
        expect(refs.map(subtype)).toEqual(['Text', 'Link']);
      });

      it('writes a note in page space, whatever transform or clip it sits in', async () => {
        const pdf = await pdfText([
          { op: 'transform', matrix: [0, 1, -1, 0, 100, 50] },
          { op: 'clip', x: 0, y: 0, w: 5, h: 5, radii: SQUARE },
          NOTE,
          { op: 'unclip' },
          { op: 'untransform' },
        ]);
        expect(notesIn(pdf)[0]).toContain('/Rect [10 170 30 190]');
      });
    });

    it('draws the ops between transform and untransform in the transformed space', async () => {
      const rect = {
        op: 'rect',
        x: 0,
        y: 0,
        w: 20,
        h: 10,
        radii: SQUARE,
        fill: '#ff0000',
        opacity: 1,
      } as const;
      const content = contentOf(
        await pdfText([
          { op: 'transform', matrix: [0, 1, -1, 0, 100, 50] },
          { op: 'transform', matrix: [2, 0, 0, 2, 0, 0] },
          rect,
          { op: 'untransform' },
          { op: 'untransform' },
          rect,
        ]),
      );
      expect(content).toMatch(/\nq\n0 1 -1 0 100 50 cm\nq\n2 0 0 2 0 0 cm\nq\n/);
      // Both transforms are restored after the first rect, so the second one is untransformed.
      expect(content).toMatch(/0 0 20 10 re\nf\nQ\nQ\nQ\nq\n/);
      expect(count(content, /\scm\n/g)).toBe(3);
    });

    it('clips the ops between clip and unclip to a square or rounded rect', async () => {
      const rect = {
        op: 'rect',
        x: 0,
        y: 0,
        w: 200,
        h: 200,
        radii: SQUARE,
        fill: '#ff0000',
        opacity: 1,
      } as const;
      const content = contentOf(
        await pdfText([
          { op: 'clip', x: 10, y: 20, w: 80, h: 40, radii: SQUARE },
          { op: 'clip', x: 10, y: 20, w: 80, h: 40, radii: { ...SQUARE, topLeft: 6 } },
          rect,
          { op: 'unclip' },
          { op: 'unclip' },
        ]),
      );
      expect(content).toMatch(/\nq\n10 20 80 40 re\nW n\nq\n16 20 m\n/);
      expect(count(content, /\sc\n/g)).toBe(1);
      expect(content).toMatch(/\nh\nW n\n/);
      // Both clips are restored after the rect.
      expect(content).toMatch(/0 0 200 200 re\nf\nQ\nQ\nQ\n/);
    });

    describe('gradients', () => {
      const RECT = { op: 'rect', x: 10, y: 10, w: 80, h: 40, radii: SQUARE, opacity: 1 } as const;
      const STOPS = [
        { offset: 0, color: '#ff0000', opacity: 1 },
        { offset: 0.25, color: '#00ff00', opacity: 1 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ];

      it('fills a rect with an axial shading through every stop', async () => {
        const pdf = await pdfText([
          { ...RECT, gradient: { kind: 'linear', x1: 50, y1: 10, x2: 50, y2: 50, stops: STOPS } },
        ]);
        expect(pdf).toContain('/ShadingType 2');
        expect(pdf).toContain('/Coords [50 10 50 50]');
        expect(pdf).toContain('/Bounds [0.25]');
        expect(pdf).toMatch(/\/C0 \[1 0 0\]/);
        expect(pdf).toMatch(/\/C1 \[0 0 1\]/);
        const content = contentOf(pdf);
        expect(content).toContain('10 10 80 40 re');
        expect(content).toMatch(/\/Pattern cs\n\/Sh\d+ scn\nf\n/);
        // No solid color fill without `fill`.
        expect(content).not.toMatch(/ rg\n|\/DeviceRGB cs/);
        expect(pdf).not.toContain('/SMask');
      });

      it('fills a rounded rect with a radial shading squashed into an ellipse', async () => {
        const pdf = await pdfText([
          {
            ...RECT,
            radii: { topLeft: 6, topRight: 6, bottomRight: 6, bottomLeft: 6 },
            gradient: { kind: 'radial', cx: 50, cy: 30, r1: 2, r2: 40, scaleY: 0.5, stops: STOPS },
          },
        ]);
        expect(pdf).toContain('/ShadingType 3');
        expect(pdf).toContain('/Coords [0 0 2 0 0 40]');
        // pdfkit's flip of y (1 0 0 -1 0 200) times the gradient's own transform.
        expect(pdf).toContain('/Matrix [1 0 0 -0.5 50 170]');
        expect(count(contentOf(pdf), /\sc\n/g)).toBe(4);
      });

      it('masks the shading with the stop opacities', async () => {
        const faded = STOPS.map((stop, i) => ({ ...stop, opacity: i === 0 ? 0.25 : 1 }));
        const pdf = await pdfText([
          { ...RECT, gradient: { kind: 'linear', x1: 10, y1: 30, x2: 90, y2: 30, stops: faded } },
        ]);
        expect(pdf).toContain('/SMask');
        expect(pdf).toMatch(/\/C0 \[0\.25\]/);
      });

      it('fills the color first, then the gradient over the same outline at full opacity', async () => {
        const pdf = await pdfText([
          {
            ...RECT,
            fill: '#eeeeee',
            opacity: 0.5,
            gradient: { kind: 'linear', x1: 50, y1: 10, x2: 50, y2: 50, stops: STOPS },
          },
        ]);
        const content = contentOf(pdf);
        expect(count(content, /10 10 80 40 re/g)).toBe(2);
        const color = content.indexOf('/Gs1 gs');
        const pattern = content.indexOf('/Pattern cs');
        expect(color).toBeGreaterThanOrEqual(0);
        expect(pattern).toBeGreaterThan(color);
        // The color's opacity state ends before the gradient fills.
        expect(content.slice(color, pattern)).toMatch(/\nQ\nq\n/);
      });
    });

    describe('groups', () => {
      const RED: DrawOp = {
        op: 'rect',
        x: 10,
        y: 10,
        w: 50,
        h: 50,
        radii: SQUARE,
        fill: '#ff0000',
        opacity: 1,
      };
      const BLUE: DrawOp = { ...RED, x: 30, y: 30, fill: '#0000ff' };

      /** The dictionary and stream of each Form XObject, by object number. */
      function forms(pdf: string): { id: string; dict: string; body: string }[] {
        const pattern =
          /(\d+) 0 obj\n(<<\n\/Type \/XObject\n\/Subtype \/Form\n[\s\S]*?>>)\nstream\n([\s\S]*?)\nendstream/g;
        return [...pdf.matchAll(pattern)]
          .map((match) => ({ id: match[1] ?? '', dict: match[2] ?? '', body: match[3] ?? '' }))
          .filter((form) => form.dict.includes('/S /Transparency'));
      }

      /** The page's content stream: the one the page dictionary names. */
      function pageContent(pdf: string): string {
        const id = /\/Contents (\d+) 0 R/.exec(pdf)?.[1] ?? '';
        const match = new RegExp(
          `\\n${id} 0 obj\\n<<[\\s\\S]*?>>\\nstream\\n([\\s\\S]*?)\\nendstream`,
        ).exec(pdf);
        return match?.[1] ?? '';
      }

      it('draws the ops of a group in a transparency group XObject, painted at its opacity', async () => {
        const pdf = await pdfText([{ op: 'group', opacity: 0.5 }, RED, BLUE, { op: 'ungroup' }]);
        const [form, ...others] = forms(pdf);
        expect(others).toEqual([]);
        expect(form!.dict).toMatch(/\/Type \/XObject/);
        expect(form!.dict).toMatch(/\/Group <<\n\/Type \/Group\n\/S \/Transparency\n>>/);
        expect(form!.dict).toContain('/BBox [0 0 200 200]');
        // The page's own resources, so a font or an image is never embedded twice.
        const resources = /\/Resources (\d+ 0 R)/.exec(form!.dict)?.[1];
        const pageResources = /\/Type \/Page\n[\s\S]*?\/Resources (\d+ 0 R)/.exec(pdf)?.[1];
        expect(resources).toBeDefined();
        expect(resources).toBe(pageResources);
        // The rects are drawn at full opacity in the group, and only there.
        expect(count(form!.body, / re\n/g)).toBe(2);
        const page = pageContent(pdf);
        expect(page).not.toMatch(/ re\n/);
        const gs = /\/(Gs\d+) gs\n\/(Fm\d+) Do\n/.exec(page);
        expect(gs).not.toBeNull();
        expect(pdf).toMatch(new RegExp(`/${gs![2]!} ${form!.id} 0 R`));
        expect(pdf).toMatch(/<<\n\/Type \/ExtGState\n\/ca 0\.5\n\/CA 0\.5\n>>/);
        expect(count(page, /^q$/gm)).toBe(count(page, /^Q$/gm));
        expect(count(form!.body, /^q$/gm)).toBe(count(form!.body, /^Q$/gm));
      });

      it('nests groups, each drawn in the group around it', async () => {
        const pdf = await pdfText([
          { op: 'group', opacity: 0.5 },
          RED,
          { op: 'group', opacity: 0.4 },
          BLUE,
          { op: 'ungroup' },
          { op: 'ungroup' },
        ]);
        const all = forms(pdf);
        expect(all).toHaveLength(2);
        // The inner one ends first.
        const [inner, outer] = all;
        expect(inner!.body).toContain('0 0 1 scn');
        expect(outer!.body).toContain('1 0 0 scn');
        expect(outer!.body).toMatch(/\/Gs\d+ gs\n\/Fm\d+ Do\n/);
        expect(pdf).toMatch(/\/ca 0\.4\n/);
        expect(count(pageContent(pdf), / Do\n/g)).toBe(1);
      });

      it('shares fonts and images with the page, embedding each once', async () => {
        const png = tinyPng();
        const image: DrawOp = {
          op: 'image',
          x: 0,
          y: 0,
          w: 3,
          h: 2,
          clip: { x: 0, y: 0, w: 3, h: 2 },
          data: png,
        };
        const words: DrawOp = { ...TEXT_OP, opacity: 1, underline: false, strike: false };
        const pdf = await pdfText([
          words,
          image,
          { op: 'group', opacity: 0.5 },
          words,
          image,
          { op: 'ungroup' },
        ]);
        expect(count(pdf, /\/Type \/Font\n/g)).toBe(1);
        expect(count(pdf, /\/Subtype \/Image\n/g)).toBe(1);
        const [form] = forms(pdf);
        expect(form!.body).toMatch(/\/F\d+ 12 Tf/);
        expect(form!.body).toMatch(/\/I\d+ Do/);
      });

      it('maps a gradient in a group to the space the group is drawn in', async () => {
        const stops = [
          { offset: 0, color: '#ff0000', opacity: 1 },
          { offset: 1, color: '#0000ff', opacity: 0.5 },
        ];
        const pdf = await pdfText([
          { op: 'group', opacity: 0.5 },
          { ...RED, gradient: { kind: 'linear', x1: 10, y1: 10, x2: 60, y2: 10, stops } },
          { op: 'ungroup' },
        ]);
        // Without pdfkit's flip of y, which the page applies before the group is drawn.
        expect(pdf).toContain('/PatternType 2');
        expect(pdf).toMatch(/\/Matrix \[1 0 0 1 0 0\]/);
        expect(pdf).not.toContain('/Matrix [1 0 0 -1 0 200]');
        expect(forms(pdf)[0]!.body).toMatch(/\/Sh\d+ scn/);
      });

      it('maps a gradient after a group through the page transform again', async () => {
        const stops = [
          { offset: 0, color: '#ff0000', opacity: 1 },
          { offset: 1, color: '#0000ff', opacity: 1 },
        ];
        const pdf = await pdfText([
          { op: 'group', opacity: 0.5 },
          RED,
          { op: 'ungroup' },
          { ...RED, gradient: { kind: 'linear', x1: 10, y1: 10, x2: 60, y2: 10, stops } },
        ]);
        expect(pdf).toContain('/Matrix [1 0 0 -1 0 200]');
      });

      it('bounds a group under a transform by the page, in the space it is drawn in', async () => {
        const pdf = await pdfText([
          { op: 'transform', matrix: [2, 0, 0, 2, 50, 0] },
          { op: 'group', opacity: 0.5 },
          RED,
          { op: 'ungroup' },
          { op: 'untransform' },
        ]);
        expect(forms(pdf)[0]!.dict).toContain('/BBox [-25 0 75 100]');
      });

      it('bounds a group in a group by the page, through the transforms of both', async () => {
        const pdf = await pdfText([
          { op: 'transform', matrix: [1, 0, 0, 1, 150, 0] },
          { op: 'group', opacity: 0.5 },
          { op: 'group', opacity: 0.5 },
          RED,
          { op: 'ungroup' },
          { op: 'ungroup' },
          { op: 'untransform' },
        ]);
        // The inner form ends first; both are drawn in the space moved 150 to the right.
        const [inner, outer] = forms(pdf);
        expect(outer!.dict).toContain('/BBox [-150 0 50 200]');
        expect(inner!.dict).toContain('/BBox [-150 0 50 200]');
      });

      it('carries the transforms of every group around it into a deeper group', async () => {
        const pdf = await pdfText([
          { op: 'transform', matrix: [1, 0, 0, 1, 150, 0] },
          { op: 'group', opacity: 0.5 },
          { op: 'transform', matrix: [2, 0, 0, 2, 0, 0] },
          { op: 'group', opacity: 0.5 },
          { op: 'group', opacity: 0.5 },
          RED,
          { op: 'ungroup' },
          { op: 'ungroup' },
          { op: 'untransform' },
          { op: 'group', opacity: 0.5 },
          RED,
          { op: 'ungroup' },
          { op: 'ungroup' },
          { op: 'untransform' },
        ]);
        const [deepest, middle, sibling] = forms(pdf);
        expect(deepest!.dict).toContain('/BBox [-75 0 25 100]');
        expect(middle!.dict).toContain('/BBox [-75 0 25 100]');
        // After the scaled groups end, a group beside them is back in the outer form's space.
        expect(sibling!.dict).toContain('/BBox [-150 0 50 200]');
      });

      it('gives a group under a transform that flattens the page an empty box', async () => {
        const pdf = await pdfText([
          { op: 'transform', matrix: [0, 0, 0, 0, 0, 0] },
          { op: 'group', opacity: 0.5 },
          RED,
          { op: 'ungroup' },
          { op: 'untransform' },
        ]);
        expect(forms(pdf)[0]!.dict).toContain('/BBox [0 0 0 0]');
      });

      it('rejects a group that is not closed, and an ungroup without a group', async () => {
        await expect(pdfText([{ op: 'group', opacity: 0.5 }, RED])).rejects.toThrow(
          'ngpdf: group without an ungroup',
        );
        await expect(pdfText([{ op: 'ungroup' }])).rejects.toThrow(
          'ngpdf: ungroup without a group',
        );
      });

      it('writes the links of a group where they would be without it', async () => {
        const link: DrawOp = {
          op: 'link',
          x: 10,
          y: 20,
          w: 30,
          h: 40,
          kind: 'uri',
          url: 'https://example.com/',
        };
        const rectOf = (pdf: string) => /\/Rect \[([^\]]*)\]/.exec(pdf)?.[1];
        const plain = await pdfText([link]);
        const grouped = await pdfText([
          { op: 'transform', matrix: [1, 0, 0, 1, 5, 5] },
          { op: 'group', opacity: 0.5 },
          link,
          RED,
          { op: 'ungroup' },
          { op: 'untransform' },
        ]);
        expect(rectOf(grouped)).toBeDefined();
        expect(rectOf(grouped)).toBe(rectOf(plain));
      });
    });

    it('strokes a path op with its lines and curves', async () => {
      const content = contentOf(
        await pdfText([
          {
            op: 'path',
            from: { x: 10, y: 20 },
            segments: [
              { kind: 'line', to: { x: 50, y: 20 } },
              { kind: 'curve', c1: { x: 55, y: 20 }, c2: { x: 60, y: 25 }, to: { x: 60, y: 30 } },
            ],
            width: 3,
            color: '#0000ff',
            opacity: 1,
          },
        ]),
      );
      expect(content).toMatch(/\n3 w\n/);
      expect(content).toMatch(/\n10 20 m\n50 20 l\n55 20 60 25 60 30 c\nS\n/);
    });

    it('dashes a path op with a dash, inside its own graphics state', async () => {
      const path = (dash?: readonly number[]): DrawOp => ({
        op: 'path',
        from: { x: 0, y: 0 },
        segments: [{ kind: 'line', to: { x: 10, y: 0 } }],
        width: 0.5,
        color: '#0000ff',
        opacity: 1,
        ...(dash && { dash }),
      });
      const content = contentOf(await pdfText([path([2, 1]), path()]));
      expect(content).toMatch(/\nq\n[^Q]*\[2 1\] 0 d\n[^Q]*0 0 m\n10 0 l\nS\nQ\n/);
      // The second path starts from a restored state, so it is solid.
      expect(count(content, / d\n/g)).toBe(1);
    });

    it('clips an image with re + W n and paints it with Do', async () => {
      const content = contentOf(
        await pdfText([
          {
            op: 'image',
            x: 5,
            y: 5,
            w: 30,
            h: 20,
            clip: { x: 5, y: 5, w: 20, h: 20 },
            data: tinyPng(),
          },
        ]),
      );
      expect(content).toMatch(/5 5 20 20 re\nW n\n/);
      expect(content).toMatch(/\/I\d+ Do\n/);
      expect(content.indexOf('W n')).toBeLessThan(content.indexOf(' Do'));
    });

    it('sets opacity through an ExtGState and balances q and Q', async () => {
      const pdf = await pdfText([
        { op: 'rect', x: 0, y: 0, w: 10, h: 10, radii: SQUARE, fill: '#000', opacity: 0.5 },
        { op: 'line', x1: 0, y1: 0, x2: 9, y2: 9, width: 1, color: '#00f', opacity: 1 },
        {
          op: 'path',
          from: { x: 0, y: 0 },
          segments: [{ kind: 'line', to: { x: 5, y: 0 } }],
          width: 1,
          color: '#00f',
          opacity: 0.5,
        },
        TEXT_OP,
        {
          op: 'image',
          x: 0,
          y: 0,
          w: 3,
          h: 2,
          clip: { x: 0, y: 0, w: 3, h: 2 },
          data: tinyPng(),
        },
      ]);
      const content = contentOf(pdf);
      expect(content).toMatch(/\/Gs\d+ gs\n/);
      expect(pdf).toMatch(/\/ca 0\.5\b/);
      expect(count(content, /^q$/gm)).toBeGreaterThanOrEqual(4);
      expect(count(content, /^q$/gm)).toBe(count(content, /^Q$/gm));
    });

    it('draws a text op as one line, also when kerning narrows it across a space', async () => {
      // ' V' kerns by -50/1000 em, so pdfkit's word-by-word sum is 0.45pt over the line's width.
      const line = 'Clínica Bem Viver';
      const width = writer.widthOf(line, 'Helvetica', 9);
      const content = contentOf(
        await pdfText([{ ...TEXT_OP, text: line, size: 9, opacity: 1, strike: false }]),
      );
      expect(count(content, /^BT$/gm)).toBe(1);
      const strokes = [...content.matchAll(/^([\d.]+) [\d.]+ m\n([\d.]+) [\d.]+ l$/gm)];
      expect(strokes).toHaveLength(1);
      const [, from, to] = strokes[0] as RegExpMatchArray;
      expect(Number(to) - Number(from)).toBeCloseTo(width, 3);
    });

    it('draws word-spaced text word by word at the measured positions, underlined through the gaps', async () => {
      const line = 'Bem Viver  agora';
      const spacing = 4;
      const content = contentOf(
        await pdfText([
          { ...TEXT_OP, text: line, opacity: 1, strike: false, wordSpacing: spacing },
        ]),
      );
      const starts = [...content.matchAll(/^1 0 0 1 ([\d.]+) [\d.]+ Tm$/gm)].map((m) =>
        Number(m[1]),
      );
      const width = (part: string) => writer.widthOf(part, 'Helvetica', 12);
      // A word starts where the text through it ends, minus its own width: ' V' kerns by -0.6pt.
      const at = (through: string, word: string, gaps: number) =>
        TEXT_OP.x + width(through) - width(word) + gaps * spacing;
      expect(starts).toHaveLength(3);
      expect(starts[0]).toBeCloseTo(TEXT_OP.x, 3);
      expect(starts[1]).toBeCloseTo(at('Bem Viver', 'Viver', 1), 3);
      expect(starts[2]).toBeCloseTo(at(line, 'agora', 2), 3);
      const strokes = [...content.matchAll(/^([\d.]+) [\d.]+ m\n([\d.]+) [\d.]+ l$/gm)];
      const [from, to] = [Number(strokes[0]![1]), Number(strokes.at(-1)![2])];
      expect(from).toBeCloseTo(TEXT_OP.x, 3);
      expect(to).toBeCloseTo(at(line, '', 2), 3);
    });

    it('draws letter-spaced text one character at a time, kerned, underlined to the end', async () => {
      const line = 'AV';
      const content = contentOf(
        await pdfText([{ ...TEXT_OP, text: line, opacity: 1, strike: false, letterSpacing: 3 }]),
      );
      const starts = [...content.matchAll(/^1 0 0 1 ([\d.]+) [\d.]+ Tm$/gm)].map((m) =>
        Number(m[1]),
      );
      const width = (part: string) => writer.widthOf(part, 'Helvetica', 12);
      // 'AV' kerns, so V starts where the pair ends minus its own width, plus one spacing.
      expect(starts).toEqual([
        expect.closeTo(TEXT_OP.x, 3),
        expect.closeTo(TEXT_OP.x + width('AV') - width('V') + 3, 3),
      ]);
      const strokes = [...content.matchAll(/^([\d.]+) [\d.]+ m\n([\d.]+) [\d.]+ l$/gm)];
      expect(Number(strokes[0]![1])).toBeCloseTo(TEXT_OP.x, 3);
      expect(Number(strokes.at(-1)![2])).toBeCloseTo(TEXT_OP.x + width('AV') + 2 * 3, 3);
    });

    it('measures and draws letter-spaced text without optional ligatures', async () => {
      const { default: PDFDocument } = await import('pdfkit');
      const measured = vi.spyOn(PDFDocument.prototype, 'widthOfString');
      const drawn = vi.spyOn(PDFDocument.prototype, 'text');
      await pdfText([{ ...TEXT_OP, text: 'fit', opacity: 1, letterSpacing: 1 }]);
      const off = { liga: false, clig: false, dlig: false };
      expect(measured.mock.calls.length).toBeGreaterThan(0);
      for (const [, options] of measured.mock.calls)
        expect(options).toMatchObject({ features: off });
      for (const call of drawn.mock.calls) expect(call[3]).toMatchObject({ features: off });
      measured.mockRestore();
      drawn.mockRestore();
    });

    it('adds word spacing after each gap of letter-spaced, justified text', async () => {
      const content = contentOf(
        await pdfText([
          {
            ...TEXT_OP,
            text: 'a b',
            opacity: 1,
            underline: false,
            strike: false,
            letterSpacing: 1,
            wordSpacing: 5,
          },
        ]),
      );
      const starts = [...content.matchAll(/^1 0 0 1 ([\d.]+) [\d.]+ Tm$/gm)].map((m) =>
        Number(m[1]),
      );
      const width = (part: string) => writer.widthOf(part, 'Helvetica', 12);
      // The space is not drawn without a decoration.
      expect(starts).toEqual([
        expect.closeTo(TEXT_OP.x, 3),
        expect.closeTo(TEXT_OP.x + width('a ') + 2 * 1 + 5, 3),
      ]);
    });

    it('measures a justified line in linear time, not one growing prefix per word', async () => {
      const { default: PDFDocument } = await import('pdfkit');
      const measured = vi.spyOn(PDFDocument.prototype, 'widthOfString');
      const line = Array.from({ length: 400 }, () => 'ab').join(' ');
      await pdfText([
        { ...TEXT_OP, text: line, opacity: 1, underline: false, strike: false, wordSpacing: 1 },
      ]);
      const total = measured.mock.calls.reduce((sum, [text]) => sum + String(text).length, 0);
      // A prefix per word would measure about 400 * 1200 / 2 characters.
      expect(total).toBeLessThan(line.length * 10);
    });

    it('draws a leading gap as space, moving the first word right', async () => {
      const content = contentOf(
        await pdfText([
          {
            ...TEXT_OP,
            text: ' tail',
            opacity: 1,
            underline: false,
            strike: false,
            wordSpacing: 5,
          },
        ]),
      );
      const starts = [...content.matchAll(/^1 0 0 1 ([\d.]+) [\d.]+ Tm$/gm)].map((m) =>
        Number(m[1]),
      );
      expect(starts).toEqual([
        expect.closeTo(TEXT_OP.x + writer.widthOf(' ', 'Helvetica', 12) + 5, 3),
      ]);
    });

    it('draws the strike-through across the whole line, half a line height below its top', async () => {
      const width = writer.widthOf(TEXT_OP.text, 'Helvetica', 12);
      const content = contentOf(await pdfText([{ ...TEXT_OP, opacity: 1, underline: false }]));
      const strokes = [...content.matchAll(/^([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l$/gm)];
      expect(strokes).toHaveLength(1);
      const [x1, y1, x2, y2] = (strokes[0] as RegExpMatchArray).slice(1).map(Number);
      // Helvetica's line height is (ascender 718 - descender -207) / 1000 em: 11.1pt at 12pt.
      const middle = TEXT_OP.y + ((718 + 207) / 1000) * 12 * 0.5;
      expect(x1).toBeCloseTo(TEXT_OP.x, 3);
      expect(x2! - x1!).toBeCloseTo(width, 3);
      expect(y1).toBeCloseTo(middle, 3);
      expect(y2).toBeCloseTo(middle, 3);
      // 1pt thick at 12pt (a tenth of the size, rounded down).
      expect(content).toMatch(/^1 w$/m);
    });

    it('strokes underline and strike at the text opacity', async () => {
      const pdf = await pdfText([TEXT_OP]);
      expect(pdf).toMatch(/\/CA 0\.4\b/);
      expect(pdf).toMatch(/\/ca 0\.4\b/);
      const plain = await pdfText([{ ...TEXT_OP, underline: false, strike: false }]);
      expect(plain).toMatch(/\/ca 0\.4\b/);
      expect(plain).not.toMatch(/\/CA /);
    });

    it('encodes each image data URL once per write, per Uint8Array', async () => {
      const btoaSpy = vi.spyOn(globalThis, 'btoa');
      const shared = tinyPng();
      const image = (data: Uint8Array): DrawOp => ({
        op: 'image',
        x: 0,
        y: 0,
        w: 3,
        h: 2,
        clip: { x: 0, y: 0, w: 3, h: 2 },
        data,
      });
      await pdfText([image(shared), image(shared), image(shared)]);
      expect(btoaSpy).toHaveBeenCalledTimes(1);
      btoaSpy.mockClear();
      await pdfText([image(shared), image(tinyPng())]);
      expect(btoaSpy).toHaveBeenCalledTimes(2);
      btoaSpy.mockClear();
      await pdfText([image(shared)]);
      expect(btoaSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('createPdfkitWriter with anchors, internal links and bookmarks', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });

  const SHEET = { width: 200, height: 300 };

  async function pdfOf(pages: DrawOp[][], extra: Partial<DocumentInfo> = {}): Promise<string> {
    const blob = await writer.write(
      pages.map((ops) => ({ ...SHEET, ops })),
      { ...info, ...extra },
    );
    return new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
  }

  /** The object numbers of the pages, in order. */
  function pageRefs(pdf: string): string[] {
    const kids = /\/Kids \[([^\]]*)\]/.exec(pdf)?.[1] ?? '';
    return [...kids.matchAll(/(\d+) 0 R/g)].map((match) => match[1] ?? '');
  }

  /** The entries of the Dests name tree as `(name) [dest]` strings, in their written order. */
  function dests(pdf: string): string[] {
    const names = /\/Dests <<[\s\S]*?\/Names \[([\s\S]*?)\]\n>>/.exec(pdf)?.[1] ?? '';
    return [...names.matchAll(/(\(.*?\)) (\[[^\]]*\])/g)].map((m) => `${m[1] ?? ''} ${m[2] ?? ''}`);
  }

  function goTo(name: string, x = 1, y = 2): DrawOp {
    return { op: 'link', x, y, w: 10, h: 10, kind: 'goto', name };
  }

  it('makes a linked anchor a named XYZ destination, with a GoTo action to it', async () => {
    const pdf = await pdfOf([
      [goTo('intro', 10, 20)],
      [{ op: 'anchor', id: 0, name: 'intro', x: 30, y: 40 }],
    ]);
    const [, second] = pageRefs(pdf);
    // y is flipped: the sheet is 300 tall. The zoom stays as it is.
    expect(dests(pdf)).toEqual([`(intro) [${second ?? ''} 0 R /XYZ 30 260 null]`]);
    expect(pdf).toContain('/Rect [10 270 20 280]');
    expect(pdf).toMatch(/\/S \/GoTo\s+\/D \(intro\)/);
    expect(pdf).not.toContain('/URI');
  });

  it('places a name at its first anchor op, whatever comes later', async () => {
    const mark = { op: 'anchor', id: 0, name: 'top', x: 0, y: 0 } as const;
    const pdf = await pdfOf([[goTo('top'), { ...mark, y: 5 }], [mark]]);
    const [first] = pageRefs(pdf);
    expect(dests(pdf)).toEqual([`(top) [${first ?? ''} 0 R /XYZ 0 295 null]`]);
  });

  it('writes nothing for an unused anchor, and no link to an unplaced name', async () => {
    const pdf = await pdfOf([
      [{ op: 'anchor', id: 0, name: 'unused', x: 0, y: 0 }, goTo('nowhere')],
    ]);
    expect(pdf).not.toContain('unused');
    expect(pdf).not.toContain('nowhere');
    expect(pdf).not.toContain('/Annots');
    expect(dests(pdf)).toEqual([]);
  });

  it('sorts the names by their bytes, as viewers search them', async () => {
    const names = ['zeta', 'Zeta', 'alpha', 'é', '__proto__', '10', '9'];
    const pdf = await pdfOf([
      [
        ...names.map((name, id) => ({ op: 'anchor', id, name, x: 0, y: 0 }) as const),
        ...names.map((name) => goTo(name)),
      ],
    ]);
    expect(dests(pdf).map((entry) => entry.slice(0, entry.indexOf(' [')))).toEqual([
      '(10)',
      '(9)',
      '(Zeta)',
      '(__proto__)',
      '(alpha)',
      '(zeta)',
      // UTF-16BE with a byte order mark, after every ASCII name.
      '(þÿ\u0000é)',
    ]);
  });

  it('writes the outline in tree order, nested and open', async () => {
    const pdf = await pdfOf(
      [
        [
          { op: 'anchor', id: 0, x: 0, y: 10 },
          { op: 'anchor', id: 1, name: 'one', x: 5, y: 50 },
        ],
        [{ op: 'anchor', id: 2, x: 0, y: 100 }],
      ],
      {
        outline: [
          {
            title: 'Part A',
            anchor: 0,
            children: [
              { title: 'A.1', anchor: 1, children: [] },
              { title: 'Lost', anchor: 9, children: [{ title: 'Kept', anchor: 2, children: [] }] },
            ],
          },
          { title: 'Part B', anchor: 2, children: [] },
        ],
      },
    );
    const [first, second] = pageRefs(pdf);
    const item = (title: string): string =>
      new RegExp(`<<[^<>]*/Title \\(${title}\\)[^<>]*>>`).exec(pdf)?.[0] ?? '';
    expect(item('Part A')).toContain(`/Dest [${first ?? ''} 0 R /XYZ 0 290 null]`);
    expect(item('Part A')).toContain('/Count 2');
    // A bookmark on a named anchor goes to the name, which then exists.
    expect(item('A.1')).toContain('/Dest (one)');
    expect(dests(pdf)).toEqual([`(one) [${first ?? ''} 0 R /XYZ 5 250 null]`]);
    // An entry whose element was never drawn is left out; its children move up.
    expect(pdf).not.toContain('(Lost)');
    expect(item('Kept')).toContain(`/Dest [${second ?? ''} 0 R /XYZ 0 200 null]`);
    expect(item('Part B')).toContain(`/Dest [${second ?? ''} 0 R /XYZ 0 200 null]`);
    // Tree order: Part A, then Part B; A.1, then Kept, both under Part A.
    const ref = (title: string): string =>
      `${new RegExp(`(\\d+) 0 obj\\s*<<[^<>]*/Title \\(${title}\\)`).exec(pdf)?.[1] ?? '?'} 0 R`;
    expect(item('Part A')).toContain(`/Next ${ref('Part B')}`);
    expect(item('Part A')).toContain(`/First ${ref('A.1')}`);
    expect(item('Part A')).toContain(`/Last ${ref('Kept')}`);
    expect(item('A.1')).toContain(`/Next ${ref('Kept')}`);
    expect(item('Kept')).toContain(`/Parent ${ref('Part A')}`);
    expect(pdf).toMatch(/\/Outlines \d+ 0 R/);
    // Opening the outline panel stays the document's choice.
    expect(pdf).not.toContain('/PageMode /UseOutlines');
  });

  it('keeps the page mode the document asks for alongside an outline', async () => {
    const pages: DrawOp[][] = [[{ op: 'anchor', id: 0, x: 0, y: 0 }]];
    const outline = [{ title: 'Only', anchor: 0, children: [] }];
    expect(await pdfOf(pages, { outline, pageMode: 'UseOutlines' })).toContain(
      '/PageMode /UseOutlines',
    );
    expect(await pdfOf(pages, { outline, pageMode: 'FullScreen' })).toContain(
      '/PageMode /FullScreen',
    );
  });

  it('writes no outline without entries', async () => {
    const pdf = await pdfOf([[{ op: 'anchor', id: 0, x: 0, y: 0 }]], { outline: [] });
    expect(pdf).not.toContain('/Outlines');
    expect(pdf).not.toContain('/PageMode');
  });
});

describe('createPdfkitWriter with registered fonts', () => {
  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
    writer.registerFont('font:0', testFont('noto-sans-regular.ttf'));
    writer.registerFont('font:1', testFont('noto-sans-jp-subset.ttf'));
  });

  const textOp = (text: string, font: FontName): DrawOp => ({
    op: 'text',
    x: 20,
    y: 20,
    text,
    font,
    size: 12,
    color: '#000000',
    opacity: 1,
    underline: false,
    strike: false,
  });

  it('measures with the registered font, kerning included', () => {
    const width = writer.widthOf('Жук', 'font:0', 10);
    expect(width).toBeGreaterThan(0);
    expect(writer.widthOf('AV', 'font:0', 10)).toBeLessThan(
      writer.widthOf('A', 'font:0', 10) + writer.widthOf('V', 'font:0', 10),
    );
    expect(writer.ascent('font:0', 20)).toBeCloseTo(writer.ascent('font:0', 10) * 2, 5);
  });

  it('tells which code points a registered font has a glyph for', () => {
    expect(writer.hasGlyph('font:0', 'Ж'.codePointAt(0)!)).toBe(true);
    expect(writer.hasGlyph('font:0', '日'.codePointAt(0)!)).toBe(false);
    expect(writer.hasGlyph('font:1', '日'.codePointAt(0)!)).toBe(true);
    expect(writer.hasGlyph('font:1', 'A'.codePointAt(0)!)).toBe(false);
  });

  it('reads WOFF2 too', async () => {
    const woff = await createPdfkitWriter({ compress: false });
    woff.registerFont('font:0', testFont('noto-sans-basic.woff2'));
    expect(woff.widthOf('Hello', 'font:0', 10)).toBeCloseTo(
      writer.widthOf('Hello', 'font:0', 10),
      6,
    );
  });

  it('rejects bytes that are not a font', async () => {
    const bad = await createPdfkitWriter({ compress: false });
    expect(() => {
      bad.registerFont('font:0', new Uint8Array([1, 2, 3, 4]));
    }).toThrow('ngpdf: invalid font');
  });

  it('embeds only the fonts the pages use, as subsets', async () => {
    const blob = await writer.write([{ ...A4, ops: [textOp('Жук', 'font:0')] }], info);
    const pdf = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    expect(pdf).toContain('/FontFile2');
    expect(pdf).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans/);
    expect(pdf).not.toContain('NotoSansCJK');
  });

  it('embeds a CFF-based OpenType font', async () => {
    const cff = await createPdfkitWriter({ compress: false });
    cff.registerFont('font:0', testFont('inter-basic.otf'));
    const blob = await cff.write([{ ...A4, ops: [textOp('Hello', 'font:0')] }], info);
    const pdf = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    expect(pdf).toContain('/FontFile3');
  });

  it('writes the same bytes for the same pages with a custom font', async () => {
    const pages = [{ ...A4, ops: [textOp('Жук 日', 'font:0')] }];
    const a = new Uint8Array(await (await writer.write(pages, info)).arrayBuffer());
    const b = new Uint8Array(await (await writer.write(pages, info)).arrayBuffer());
    expect(b).toEqual(a);
  });
});

describe('createPdfkitWriter encryption', () => {
  const ALLOWED = {
    printing: 'high',
    copying: true,
    modifying: true,
    annotating: true,
    fillingForms: true,
    contentAccessibility: true,
    documentAssembly: true,
  } as const;
  const HELLO: DrawOp = {
    op: 'text',
    x: 10,
    y: 10,
    text: 'Hello PDF',
    font: 'Helvetica',
    size: 12,
    color: '#000',
    opacity: 1,
    underline: false,
    strike: false,
  };

  let writer: PdfWriter;
  beforeAll(async () => {
    writer = await createPdfkitWriter({ compress: false });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function pdfOf(security?: DocumentInfo['security']): Promise<string> {
    const blob = await writer.write([{ ...A4, ops: [HELLO] }], {
      ...info,
      ...(security !== undefined && { security }),
    });
    return new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
  }

  function entry(pdf: string, key: 'O' | 'U'): Uint8Array {
    const hex = new RegExp(`/${key} <([0-9a-f]+)>`).exec(pdf)?.[1] ?? '';
    return Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16));
  }

  async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
    const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) {
      joined.set(part, at);
      at += part.length;
    }
    return new Uint8Array(await crypto.subtle.digest('SHA-256', joined));
  }

  // Revision 5 checks: the hash of password + validation salt is the first 32 bytes of the entry.
  async function opensAsUser(pdf: string, password: string): Promise<boolean> {
    const u = entry(pdf, 'U');
    const hash = await sha256(new TextEncoder().encode(password), u.slice(32, 40));
    return hash.every((byte, i) => byte === u[i]);
  }

  async function opensAsOwner(pdf: string, password: string): Promise<boolean> {
    const o = entry(pdf, 'O');
    const hash = await sha256(
      new TextEncoder().encode(password),
      o.slice(32, 40),
      entry(pdf, 'U').slice(0, 48),
    );
    return hash.every((byte, i) => byte === o[i]);
  }

  it('writes no /Encrypt without security', async () => {
    const pdf = await pdfOf();
    expect(pdf).not.toContain('/Encrypt');
    expect(pdf).toContain('<48656c6c6f20504446>');
  });

  it('encrypts with AES-256, so text and metadata are no longer readable', async () => {
    const pdf = await pdfOf({ userPassword: 'open sesame', permissions: ALLOWED });
    expect(pdf.startsWith('%PDF-1.7')).toBe(true);
    expect(pdf).toMatch(/\/Encrypt \d+ 0 R/);
    expect(pdf).toMatch(/\/Filter \/Standard\s+\/V 5\s+\/Length 256/);
    expect(pdf).toContain('/CFM /AESV3');
    expect(pdf).toContain('/R 5');
    expect(pdf).not.toContain('<48656c6c6f20504446>');
    expect(pdf).not.toContain('Hello PDF');
    expect(pdf).not.toContain('Quarterly report');
    expect(pdf).not.toContain('open sesame');
  });

  it('checks the user and owner passwords', async () => {
    const pdf = await pdfOf({
      userPassword: 'reader',
      ownerPassword: 'editor',
      permissions: ALLOWED,
    });
    expect(await opensAsUser(pdf, 'reader')).toBe(true);
    expect(await opensAsUser(pdf, 'editor')).toBe(false);
    expect(await opensAsOwner(pdf, 'editor')).toBe(true);
    expect(await opensAsOwner(pdf, 'reader')).toBe(false);
  });

  it.each([
    [{}, -4],
    [{ printing: 'none' }, -2056],
    [{ printing: 'low' }, -2052],
    [{ copying: false }, -20],
    [{ modifying: false }, -12],
    [{ annotating: false }, -36],
    [{ fillingForms: false }, -260],
    [{ contentAccessibility: false }, -516],
    [{ documentAssembly: false }, -1028],
    [{ printing: 'none', copying: false, modifying: false }, -2080],
  ] as const)('writes the permissions %o as /P %i', async (permissions, bits) => {
    const pdf = await pdfOf({ ownerPassword: 'o', permissions: { ...ALLOWED, ...permissions } });
    expect(pdf).toContain(`/P ${String(bits)}\n`);
  });

  it('uses a random owner password when permissions are restricted without one', async () => {
    const drawn: string[] = [];
    const real = crypto.getRandomValues.bind(crypto);
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(
      <T extends ArrayBufferView | null>(array: T): T => {
        const result = real(array as never) as T;
        if (array instanceof Uint8Array && array.length === 32) {
          drawn.push([...array].map((byte) => byte.toString(16).padStart(2, '0')).join(''));
        }
        return result;
      },
    );
    const pdf = await pdfOf({
      userPassword: 'reader',
      permissions: { ...ALLOWED, copying: false },
    });
    expect(await opensAsUser(pdf, 'reader')).toBe(true);
    expect(await opensAsOwner(pdf, 'reader')).toBe(false);
    expect(await opensAsOwner(pdf, '')).toBe(false);
    const owners = await Promise.all(drawn.map((password) => opensAsOwner(pdf, password)));
    expect(owners.filter(Boolean)).toHaveLength(1);
  });

  it('encrypts restricted permissions without any password, opening with none', async () => {
    const pdf = await pdfOf({ permissions: { ...ALLOWED, printing: 'none' } });
    expect(pdf).toMatch(/\/Encrypt \d+ 0 R/);
    expect(await opensAsUser(pdf, '')).toBe(true);
    expect(await opensAsOwner(pdf, '')).toBe(false);
  });

  it('keeps the user password as owner when nothing is restricted', async () => {
    const pdf = await pdfOf({ userPassword: 'reader', permissions: ALLOWED });
    expect(await opensAsOwner(pdf, 'reader')).toBe(true);
  });

  it('rejects a password the PDF cannot store, without showing it', async () => {
    const write = writer.write([{ ...A4, ops: [] }], {
      ...info,
      security: { userPassword: 'tab\there', permissions: ALLOWED },
    });
    await expect(write).rejects.toThrow(/^ngpdf: invalid security password \(Prohibited character/);
    await expect(write).rejects.not.toThrow('tab\there');
  });
});
