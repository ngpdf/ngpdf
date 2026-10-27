import Courier from 'pdfkit/standard-fonts/Courier';
import CourierBold from 'pdfkit/standard-fonts/CourierBold';
import CourierBoldOblique from 'pdfkit/standard-fonts/CourierBoldOblique';
import CourierOblique from 'pdfkit/standard-fonts/CourierOblique';
import Helvetica from 'pdfkit/standard-fonts/Helvetica';
import HelveticaBold from 'pdfkit/standard-fonts/HelveticaBold';
import HelveticaBoldOblique from 'pdfkit/standard-fonts/HelveticaBoldOblique';
import HelveticaOblique from 'pdfkit/standard-fonts/HelveticaOblique';
import TimesBold from 'pdfkit/standard-fonts/TimesBold';
import TimesBoldItalic from 'pdfkit/standard-fonts/TimesBoldItalic';
import TimesItalic from 'pdfkit/standard-fonts/TimesItalic';
import TimesRoman from 'pdfkit/standard-fonts/TimesRoman';

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

/** A font registered with `PdfWriter.registerFont`; the engine names them `font:0`, `font:1`, … */
export type CustomFont = `font:${string}`;

export type FontName = StandardFont | CustomFont;

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
      readonly font: FontName;
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
  widthOf(text: string, font: FontName, size: number): number;
  ascent(font: FontName, size: number): number;
  /** Whether a registered font has a glyph for the code point. */
  hasGlyph(font: CustomFont, codePoint: number): boolean;
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
   * Makes a TrueType, OpenType, WOFF or WOFF2 font available under `name` for measuring and drawing.
   * Throws `ngpdf: invalid font` on bytes that are none of those.
   */
  registerFont(name: CustomFont, data: Uint8Array): void;
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

/** The Orientation tag (0x0112) of IFD0 in the Exif header at `tiff - 6`, or 1. */
function exifOrientation(data: Uint8Array, tiff: number): number {
  if (tiff + 8 > data.length) return 1;
  const order = readUint16(data, tiff, true);
  if (order !== 0x4d4d && order !== 0x4949) return 1;
  const bigEndian = order === 0x4d4d;
  if (readUint16(data, tiff + 2, bigEndian) !== 42) return 1;
  const offset = bigEndian ? readUint32(data, tiff + 4) : readUint32LE(data, tiff + 4);
  const ifd = tiff + offset;
  if (ifd + 2 > data.length) return 1;
  const count = readUint16(data, ifd, bigEndian);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > data.length) return 1;
    if (readUint16(data, entry, bigEndian) !== 0x0112) continue;
    // Read as a SHORT whatever the entry's type says, as pdfkit does.
    const value = readUint16(data, entry + 8, bigEndian);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

/**
 * The EXIF orientation pdfkit 0.20 draws a JPEG with, or 1. It is read the way pdfkit reads it:
 * from the first APP1 with an Exif header anywhere before the scan, with offsets bounded by the
 * whole file, not the segment. Reading it from the same place keeps the box in step with the
 * drawing.
 */
function jpegOrientation(data: Uint8Array): number {
  if (data.length < 20) return 1;
  let at = 2;
  while (at < data.length - 4) {
    while (at < data.length && data[at] !== 0xff) at++;
    if (at >= data.length - 4) return 1;
    const marker = readUint16(data, at, true);
    at += 2;
    if (marker === 0xffda) return 1;
    if ((marker >= 0xffd0 && marker <= 0xffd9) || marker === 0xff01) continue;
    const length = readUint16(data, at, true);
    const isExif = [0x45, 0x78, 0x69, 0x66, 0, 0].every((byte, i) => data[at + 2 + i] === byte);
    if (marker === 0xffe1 && isExif) return exifOrientation(data, at + 8);
    at += length;
  }
  return 1;
}

/**
 * The size the JPEG is displayed at. EXIF orientations 5 to 8 turn the picture a quarter turn, so
 * width and height swap, as browsers show it and as pdfkit draws it into the box it is given.
 */
function jpegSize(data: Uint8Array): { width: number; height: number } {
  let at = 2;
  const orientation = jpegOrientation(data);
  while (at + 4 <= data.length) {
    if (data[at] !== 0xff) throw new Error('ngpdf: invalid JPEG marker');
    const marker = data[at + 1] ?? 0;
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

/**
 * pdfkit caches an image only when its `src` is a string, so a repeated image given as a data URL
 * is embedded once. It also accepts a `Uint8Array`, but then embeds each use again.
 */
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
  _font: { ascender: number; font?: { hasGlyphForCodePoint(codePoint: number): boolean } };
}

type StandardFontData = typeof Helvetica;

/** pdfkit 0.20's standard-font registry, which `@types/pdfkit` (written for 0.17) does not know. */
interface StandardFontRegistry {
  registerStdFonts?: (...fonts: readonly StandardFontData[]) => void;
}

/** The metrics of the twelve fonts in `StandardFont`; pdfkit's browser build bundles none. */
const STANDARD_FONTS: readonly StandardFontData[] = [
  Helvetica,
  HelveticaBold,
  HelveticaOblique,
  HelveticaBoldOblique,
  TimesRoman,
  TimesBold,
  TimesItalic,
  TimesBoldItalic,
  Courier,
  CourierBold,
  CourierOblique,
  CourierBoldOblique,
];

export async function createPdfkitWriter(options: { compress?: boolean } = {}): Promise<PdfWriter> {
  const pdfkit = await import('pdfkit');
  const PDFDocument = pdfkit.default;
  // The browser build throws on a standard font nobody registered. Registering the same data again
  // changes nothing. The Node build (a user's test runner) loads its own and has no such function.
  (pdfkit as StandardFontRegistry).registerStdFonts?.(...STANDARD_FONTS);
  const compress = options.compress ?? true;

  // One document only measures; write() builds a fresh one so renders never share state.
  const measurer = new PDFDocument({
    autoFirstPage: false,
    compress,
    info: { CreationDate: new Date(0) },
  });
  // Registered again on each written document, which embeds only the glyphs its pages use.
  const registered = new Map<CustomFont, Uint8Array>();

  return {
    registerFont(name, data) {
      measurer.registerFont(name, data);
      try {
        // pdfkit parses a font when it is first selected; do it now so bad bytes fail here.
        measurer.font(name);
      } catch {
        throw new Error('ngpdf: invalid font');
      }
      registered.set(name, data);
    },

    hasGlyph(font, codePoint) {
      measurer.font(font);
      return (
        (measurer as unknown as FontInternals)._font.font?.hasGlyphForCodePoint(codePoint) ?? false
      );
    },

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
      for (const [name, data] of registered) doc.registerFont(name, data);
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

type Doc = PDFKit.PDFDocument;

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
