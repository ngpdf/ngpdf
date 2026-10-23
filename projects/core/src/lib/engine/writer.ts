export type StandardFont =
  | 'Helvetica'
  | 'Helvetica-Bold'
  | 'Helvetica-Oblique'
  | 'Helvetica-BoldOblique'
  | 'Times-Roman'
  | 'Times-Bold'
  | 'Times-Italic'
  | 'Times-BoldItalic'
  | 'Courier'
  | 'Courier-Bold'
  | 'Courier-Oblique'
  | 'Courier-BoldOblique';

export interface Clip {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type DrawOp =
  | {
      readonly op: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly radius: number;
      readonly fill: string;
      readonly opacity: number;
    }
  | {
      readonly op: 'line';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly width: number;
      readonly color: string;
      readonly opacity: number;
    }
  | {
      readonly op: 'text';
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly font: StandardFont;
      readonly size: number;
      readonly color: string;
      readonly opacity: number;
      readonly underline: boolean;
      readonly strike: boolean;
    }
  | {
      readonly op: 'image';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly clip: Clip;
      readonly data: Uint8Array;
      readonly opacity: number;
    };

export interface FontMetrics {
  widthOf(text: string, font: StandardFont, size: number): number;
  ascent(font: StandardFont, size: number): number;
}

export interface DocumentInfo {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: readonly string[];
  readonly creationDate: Date;
}

export interface PageOps {
  readonly width: number;
  readonly height: number;
  readonly ops: readonly DrawOp[];
}

export interface PdfWriter extends FontMetrics {
  /**
   * The displayed size, after a JPEG's EXIF orientation. Throws on bytes that are neither PNG nor
   * JPEG.
   */
  imageSize(data: Uint8Array): { width: number; height: number };
  write(pages: readonly PageOps[], info: DocumentInfo): Promise<Blob>;
}

function assertNever(value: never): never {
  throw new Error(`ngpdf: unhandled draw op ${JSON.stringify(value)}`);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readUint32(data: Uint8Array, at: number): number {
  return (
    (data[at] ?? 0) * 0x1000000 +
    (((data[at + 1] ?? 0) << 16) | ((data[at + 2] ?? 0) << 8) | (data[at + 3] ?? 0))
  );
}

function readUint32LE(data: Uint8Array, at: number): number {
  return (
    (data[at + 3] ?? 0) * 0x1000000 +
    (((data[at + 2] ?? 0) << 16) | ((data[at + 1] ?? 0) << 8) | (data[at] ?? 0))
  );
}

function pngSize(data: Uint8Array): { width: number; height: number } {
  // IHDR is always the first chunk: length(4) "IHDR"(4) width(4) height(4).
  const isIhdr = [0x49, 0x48, 0x44, 0x52].every((byte, i) => data[12 + i] === byte);
  if (data.length < 24 || !isIhdr) throw new Error('ngpdf: invalid PNG header');
  return { width: readUint32(data, 16), height: readUint32(data, 20) };
}

function readUint16(data: Uint8Array, at: number, bigEndian: boolean): number {
  const [high, low] = bigEndian ? [data[at], data[at + 1]] : [data[at + 1], data[at]];
  return ((high ?? 0) << 8) | (low ?? 0);
}

/** The Orientation tag (0x0112) of IFD0 in the Exif APP1 segment `[start, end)`, or 1. */
function exifOrientation(data: Uint8Array, start: number, end: number): number {
  const isExif = [0x45, 0x78, 0x69, 0x66, 0, 0].every((byte, i) => data[start + i] === byte);
  const tiff = start + 6;
  if (!isExif || tiff + 8 > end) return 1;
  const order = readUint16(data, tiff, true);
  if (order !== 0x4d4d && order !== 0x4949) return 1;
  const bigEndian = order === 0x4d4d;
  const offset = bigEndian ? readUint32(data, tiff + 4) : readUint32LE(data, tiff + 4);
  const ifd = tiff + offset;
  if (ifd + 2 > end) return 1;
  const count = readUint16(data, ifd, bigEndian);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    if (readUint16(data, entry, bigEndian) !== 0x0112) continue;
    // SHORT is what the spec says; BYTE and LONG are read the way pdfkit's jpeg-exif reads them.
    switch (readUint16(data, entry + 2, bigEndian)) {
      case 1:
        return data[entry + 8] ?? 1;
      case 3:
        return readUint16(data, entry + 8, bigEndian);
      case 4:
        return bigEndian ? readUint32(data, entry + 8) : readUint32LE(data, entry + 8);
      default:
        return 1;
    }
  }
  return 1;
}

/**
 * The size the JPEG is displayed at. EXIF orientations 5 to 8 turn the picture a quarter turn, so
 * width and height swap, as browsers show it and as pdfkit draws it into the box it is given.
 */
function jpegSize(data: Uint8Array): { width: number; height: number } {
  let at = 2;
  let orientation = 1;
  // pdfkit (through jpeg-exif) reads the orientation only from the first APP1 in the run of APPn
  // segments right after SOI. Reading it from the same place keeps the box in step with the drawing.
  let inLeadingApps = true;
  while (at + 4 <= data.length) {
    if (data[at] !== 0xff) throw new Error('ngpdf: invalid JPEG marker');
    const marker = data[at + 1] ?? 0;
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (inLeadingApps && marker === 0xe1) {
      const end = Math.min(data.length, at + 2 + readUint16(data, at + 2, true));
      orientation = exifOrientation(data, at + 4, end);
    }
    if (!isApp || marker === 0xe1) inLeadingApps = false;
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    const isStandalone = marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);
    if (isStandalone) {
      at += 2;
      continue;
    }
    const length = ((data[at + 2] ?? 0) << 8) | (data[at + 3] ?? 0);
    // SOF0-SOF15 carry the frame size, except DHT (C4), JPG (C8) and DAC (CC).
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (at + 9 > data.length) break;
      const height = ((data[at + 5] ?? 0) << 8) | (data[at + 6] ?? 0);
      const width = ((data[at + 7] ?? 0) << 8) | (data[at + 8] ?? 0);
      return orientation >= 5 && orientation <= 8
        ? { width: height, height: width }
        : { width, height };
    }
    if (length < 2) break;
    at += 2 + length;
  }
  throw new Error('ngpdf: JPEG has no frame header');
}

function imageSize(data: Uint8Array): { width: number; height: number } {
  if (PNG_SIGNATURE.every((byte, i) => data[i] === byte)) return pngSize(data);
  if (data[0] === 0xff && data[1] === 0xd8) return jpegSize(data);
  throw new Error('ngpdf: image is neither PNG nor JPEG');
}

/** pdfkit only takes Node Buffers or data URLs; a data URL works in the browser too. */
function toDataUrl(data: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < data.length; at += 0x8000) {
    binary += String.fromCharCode(...data.subarray(at, at + 0x8000));
  }
  const mime = data[0] === 0xff ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${btoa(binary)}`;
}

/** The slice of a pdfkit document that the writer touches that `@types/pdfkit` leaves private. */
interface FontInternals {
  _font: { ascender: number };
}

export async function createPdfkitWriter(options: { compress?: boolean } = {}): Promise<PdfWriter> {
  const { default: PDFDocument } = await import('pdfkit/js/pdfkit.standalone.js');
  const compress = options.compress ?? true;

  // One document only measures; write() builds a fresh one so renders never share state.
  const measurer = new PDFDocument({
    autoFirstPage: false,
    compress,
    info: { CreationDate: new Date(0) },
  });

  return {
    widthOf(text, font, size) {
      return measurer.font(font).fontSize(size).widthOfString(text);
    },

    ascent(font, size) {
      measurer.font(font);
      return ((measurer as unknown as FontInternals)._font.ascender / 1000) * size;
    },

    imageSize,

    async write(pages, info) {
      const doc = new PDFDocument({
        autoFirstPage: false,
        compress,
        info: {
          ...(info.title !== undefined && { Title: info.title }),
          ...(info.author !== undefined && { Author: info.author }),
          ...(info.subject !== undefined && { Subject: info.subject }),
          ...(info.keywords !== undefined && { Keywords: info.keywords.join(', ') }),
          CreationDate: info.creationDate,
        },
      });
      const chunks: Uint8Array[] = [];
      const done = new Promise<Blob>((resolve, reject) => {
        doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        doc.on('end', () => {
          resolve(new Blob(chunks as BlobPart[], { type: 'application/pdf' }));
        });
        doc.on('error', reject);
      });
      // One data URL per source array in this write, so a repeated image is encoded once.
      const dataUrls = new WeakMap<Uint8Array, string>();
      try {
        for (const page of pages) {
          doc.addPage({ size: [page.width, page.height], margin: 0 });
          for (const op of page.ops) drawOp(doc, op, dataUrls);
        }
      } catch (error) {
        // Nobody awaits `done` on this path; keep a late stream error from going unhandled.
        done.catch(() => undefined);
        throw error;
      } finally {
        doc.end();
      }
      return done;
    },
  };
}

type Doc = InstanceType<Awaited<typeof import('pdfkit/js/pdfkit.standalone.js')>['default']>;

/**
 * pdfkit options that draw `op.text` as the one line the layout made of it. Any `width` turns on
 * pdfkit's own line wrapper, which sums the words measured one by one; that sum leaves out the
 * kerning across a space (Helvetica kerns " V" and " T" by -50/1000 em), comes out wider than the
 * line and wraps its last word below it. Without `width`, the decorations read the line's width
 * from `textWidth` (and `wordCount`, for word spacing), which the wrapper would otherwise set.
 */
function singleLine(op: Extract<DrawOp, { op: 'text' }>, width: number): PDFKit.Mixins.TextOptions {
  const options = {
    lineBreak: false,
    underline: op.underline,
    strike: op.strike,
    textWidth: width,
    wordCount: 1,
  };
  return options;
}

function drawOp(doc: Doc, op: DrawOp, dataUrls: WeakMap<Uint8Array, string>): void {
  switch (op.op) {
    case 'rect':
      doc.save();
      doc.fillColor(op.fill, op.opacity);
      if (op.radius > 0) doc.roundedRect(op.x, op.y, op.w, op.h, op.radius);
      else doc.rect(op.x, op.y, op.w, op.h);
      doc.fill();
      doc.restore();
      return;
    case 'line':
      doc.save();
      doc.lineWidth(op.width).strokeColor(op.color, op.opacity);
      doc.moveTo(op.x1, op.y1).lineTo(op.x2, op.y2).stroke();
      doc.restore();
      return;
    case 'text':
      doc.save();
      doc.font(op.font).fontSize(op.size).fillColor(op.color, op.opacity);
      doc.text(op.text, op.x, op.y, singleLine(op, doc.widthOfString(op.text)));
      doc.restore();
      return;
    case 'image': {
      doc.save();
      doc.rect(op.clip.x, op.clip.y, op.clip.w, op.clip.h).clip();
      doc.fillOpacity(op.opacity);
      let url = dataUrls.get(op.data);
      if (url === undefined) {
        url = toDataUrl(op.data);
        dataUrls.set(op.data, url);
      }
      doc.image(url, op.x, op.y, { width: op.w, height: op.h });
      doc.restore();
      return;
    }
    default:
      return assertNever(op);
  }
}
