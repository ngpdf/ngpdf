import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPdfkitWriter, type DrawOp, type PdfWriter, type StandardFont } from './writer';

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
const info = { title: 'Quarterly report', creationDate: new Date('2026-01-02T03:04:05Z') };

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
      { op: 'rect', x: 10, y: 10, w: 100, h: 50, radius: 4, fill: '#ff0000', opacity: 0.5 },
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
        opacity: 0.8,
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
      { op: 'rect', x: 0, y: 0, w: 5, h: 5, radius: 0, fill: '#000', opacity: 1 },
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
      const ops: DrawOp[] = [{ op: 'image', x: 10, y: 20, w, h, clip, data: jpeg, opacity: 1 }];
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
      const ops: DrawOp[] = [{ op: 'image', x: 10, y: 20, w, h, clip, data: jpeg, opacity: 1 }];
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
      { op: 'rect', x: 1, y: 1, w: 9, h: 9, radius: 0, fill: '#0f0', opacity: 1 },
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
      const rounded = contentOf(
        await pdfText([
          { op: 'rect', x: 10, y: 10, w: 80, h: 40, radius: 6, fill: '#ff0000', opacity: 1 },
        ]),
      );
      expect(count(rounded, /\sc\n/g)).toBe(4);
      expect(rounded).toMatch(/\nf\n/);
      const square = contentOf(
        await pdfText([
          { op: 'rect', x: 10, y: 10, w: 80, h: 40, radius: 0, fill: '#ff0000', opacity: 1 },
        ]),
      );
      expect(square).toContain('10 10 80 40 re');
      expect(count(square, /\sc\n/g)).toBe(0);
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
            opacity: 0.8,
          },
        ]),
      );
      expect(content).toMatch(/5 5 20 20 re\nW n\n/);
      expect(content).toMatch(/\/I\d+ Do\n/);
      expect(content.indexOf('W n')).toBeLessThan(content.indexOf(' Do'));
    });

    it('sets opacity through an ExtGState and balances q and Q', async () => {
      const pdf = await pdfText([
        { op: 'rect', x: 0, y: 0, w: 10, h: 10, radius: 0, fill: '#000', opacity: 0.5 },
        { op: 'line', x1: 0, y1: 0, x2: 9, y2: 9, width: 1, color: '#00f', opacity: 1 },
        TEXT_OP,
        {
          op: 'image',
          x: 0,
          y: 0,
          w: 3,
          h: 2,
          clip: { x: 0, y: 0, w: 3, h: 2 },
          data: tinyPng(),
          opacity: 0.8,
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
        opacity: 1,
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
