import type { PdfSecurity } from '../tree/security';
import type { PageLayout, PageMode } from '../tree/viewer-preferences';
import { graphemeStarts } from './graphemes';
import type { Corners } from './style';
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

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type PathSegment =
  | { readonly kind: 'line'; readonly to: Point }
  /** A cubic Bézier curve through control points `c1` and `c2`. */
  | { readonly kind: 'curve'; readonly c1: Point; readonly c2: Point; readonly to: Point };

/** A PDF/CSS affine matrix `[a, b, c, d, e, f]`: x' = ax + cy + e, y' = bx + dy + f. */
export type Matrix = readonly [number, number, number, number, number, number];

export interface GradientStop {
  /** From 0 at the start point or inner circle to 1 at the end point or outer circle. */
  readonly offset: number;
  readonly color: string;
  readonly opacity: number;
}

export type GradientFill =
  | {
      readonly kind: 'linear';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly stops: readonly GradientStop[];
    }
  /** Circles around (cx, cy), squashed vertically by `scaleY` into ellipses. */
  | {
      readonly kind: 'radial';
      readonly cx: number;
      readonly cy: number;
      readonly r1: number;
      readonly r2: number;
      readonly scaleY: number;
      readonly stops: readonly GradientStop[];
    };

export type DrawOp =
  | {
      readonly op: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      /** Each corner's radius, already small enough to fit the rect. */
      readonly radii: Corners<number>;
      /** The color, drawn under `gradient`; none when only the gradient paints. */
      readonly fill?: string;
      /** Of `fill`; a gradient carries its opacity in its stops. */
      readonly opacity: number;
      readonly gradient?: GradientFill;
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
  /** An open stroked path, such as one side of a rounded border. */
  | {
      readonly op: 'path';
      readonly from: Point;
      readonly segments: readonly PathSegment[];
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
      /** Width added to each word gap (a run of spaces and no-break spaces), for justified text. */
      readonly wordSpacing?: number;
      /** Width added after each grapheme cluster, from `letter-spacing`. */
      readonly letterSpacing?: number;
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
    }
  /** Transforms every op up to the matching `untransform`; transforms nest. */
  | { readonly op: 'transform'; readonly matrix: Matrix }
  | { readonly op: 'untransform' }
  /** Clips every op up to the matching `unclip`; clips nest. */
  | {
      readonly op: 'clip';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly radii: Corners<number>;
    }
  | { readonly op: 'unclip' }
  /**
   * A clickable rectangle. It opens `url`, an http, https or mailto URL the engine checked, or
   * jumps to the anchor `name`. In page space: the transforms and clips around it do not apply.
   * It draws nothing.
   */
  | ({
      readonly op: 'link';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    } & (
      | { readonly kind: 'uri'; readonly url: string }
      | { readonly kind: 'goto'; readonly name: string }
    ))
  /**
   * A place in the document, at the top left of a box with an `anchor` or a `bookmark`, in page
   * space. The first op of each `id` in the document is the place; later ones repeat it, as a
   * fixed view or a split text does. It draws nothing.
   */
  | {
      readonly op: 'anchor';
      readonly id: number;
      /** The anchor name links use; a bookmark alone has none. */
      readonly name?: string;
      readonly x: number;
      readonly y: number;
    };

/** One bookmark of the document outline, pointing at the place of anchor op `anchor`. */
export interface OutlineItem {
  readonly title: string;
  readonly anchor: number;
  readonly children: readonly OutlineItem[];
}

export interface FontMetrics {
  /** With `ligatures` false, the optional ligatures (liga, clig, dlig) are left out. */
  widthOf(text: string, font: FontName, size: number, ligatures?: boolean): number;
  ascent(font: FontName, size: number): number;
  /** Whether a registered font has a glyph for the code point. */
  hasGlyph(font: CustomFont, codePoint: number): boolean;
}

export interface DocumentInfo {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: readonly string[];
  readonly language?: string;
  readonly creator?: string;
  readonly producer: string;
  readonly pageMode?: PageMode;
  readonly pageLayout?: PageLayout;
  readonly creationDate: Date;
  /** The bookmarks, in tree order. No entries, no outline. */
  readonly outline?: readonly OutlineItem[];
  /** Encrypts the file. Unset, it is written unencrypted. */
  readonly security?: DocumentSecurity;
}

/** A checked `PdfSecurity`: empty passwords left out and every permission spelled out. */
export interface DocumentSecurity {
  readonly userPassword?: string;
  readonly ownerPassword?: string;
  readonly permissions: Readonly<Required<NonNullable<PdfSecurity['permissions']>>>;
}

/** Whether any permission is turned off. */
export function restricts(permissions: DocumentSecurity['permissions']): boolean {
  const { printing, ...flags } = permissions;
  return printing !== 'high' || Object.values(flags).some((allowed) => !allowed);
}

const PRINTING = { none: undefined, low: 'lowResolution', high: 'highResolution' } as const;

/** 32 random bytes as hex, so nobody can lift the permissions without being given a password. */
function randomOwnerPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** pdfkit's options for AES-256 (PDF 1.7, extension level 3). */
function encryptionOptions(security: DocumentSecurity): PDFKit.PDFDocumentOptions {
  const { printing, ...flags } = security.permissions;
  const ownerPassword =
    security.ownerPassword ?? (restricts(security.permissions) ? randomOwnerPassword() : undefined);
  const printingOption = PRINTING[printing];
  return {
    pdfVersion: '1.7ext3',
    ...(security.userPassword !== undefined && { userPassword: security.userPassword }),
    ...(ownerPassword !== undefined && { ownerPassword }),
    permissions: { ...flags, ...(printingOption !== undefined && { printing: printingOption }) },
  };
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

interface PdfKitInternals {
  info: { Creator?: unknown };
  _root: {
    data: {
      PageMode?: PageMode;
      PageLayout?: PageLayout;
      Pages: { data: { Kids: unknown[] } };
      Names: { data: { Dests: NameTreeInternals } };
    };
  };
  /** Typed here because `@types/pdfkit` takes numbers only, and an XYZ zoom of null keeps it. */
  addNamedDestination(name: string, fit: 'XYZ', x: number, y: number, zoom: null): void;
  outline: OutlineInternals;
}

/** pdfkit 0.20's name tree: keys in a plain object, sorted with `localeCompare` when written. */
interface NameTreeInternals {
  _items: Record<string, unknown>;
  _compareKeys: (a: string, b: string) => number;
}

/** pdfkit 0.20's outline entry, which points at the current page unless `Dest` is replaced. */
interface OutlineInternals {
  addItem(title: string, options: { expanded: boolean }): OutlineInternals;
  outlineData: { Dest?: unknown };
}

function isAscii(key: string): boolean {
  for (let i = 0; i < key.length; i++) if (key.charCodeAt(i) > 0x7f) return false;
  return true;
}

/**
 * Name tree keys in the order of their bytes, as the PDF format asks and viewers search them.
 * pdfkit writes an ASCII string as it is and any other as UTF-16BE after FE FF, so ASCII keys
 * come first, and within each kind the code units decide.
 */
function compareKeyBytes(a: string, b: string): number {
  const [asciiA, asciiB] = [isAscii(a), isAscii(b)];
  if (asciiA !== asciiB) return asciiA ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Where an anchor landed: its first op in the document. */
interface Place {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly name?: string;
}

function placesOf(pages: readonly PageOps[]): Map<number, Place> {
  const places = new Map<number, Place>();
  pages.forEach((page, index) => {
    for (const op of page.ops) {
      if (op.op !== 'anchor' || places.has(op.id)) continue;
      const { x, y, name } = op;
      places.set(op.id, { page: index, x, y, ...(name !== undefined && { name }) });
    }
  });
  return places;
}

/**
 * The names written as named destinations: those a link jumps to or a bookmark points at, and
 * only once their anchor has a place. An unused anchor writes nothing.
 */
function destinationsOf(
  pages: readonly PageOps[],
  places: ReadonlyMap<number, Place>,
  outline: readonly OutlineItem[],
): Map<string, Place> {
  const byName = new Map<string, Place>();
  for (const place of places.values()) if (place.name !== undefined) byName.set(place.name, place);
  const used = new Map<string, Place>();
  const use = (name: string | undefined): void => {
    if (name === undefined) return;
    const place = byName.get(name);
    if (place) used.set(name, place);
  };
  for (const page of pages) {
    for (const op of page.ops) if (op.op === 'link' && op.kind === 'goto') use(op.name);
  }
  const visit = (items: readonly OutlineItem[]): void => {
    for (const item of items) {
      use(places.get(item.anchor)?.name);
      visit(item.children);
    }
  };
  visit(outline);
  return used;
}

/** pdfkit 0.20's gradient transform, which `@types/pdfkit` leaves out. */
interface GradientTransform {
  setTransform(m11: number, m12: number, m21: number, m22: number, dx: number, dy: number): void;
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

    widthOf(text, font, size, ligatures) {
      const options = ligatures === false ? { features: NO_LIGATURES } : undefined;
      return measurer.font(font).fontSize(size).widthOfString(text, options);
    },

    ascent(font, size) {
      measurer.font(font);
      return ((measurer as unknown as FontInternals)._font.ascender / 1000) * size;
    },

    imageSize,

    async write(pages, info) {
      let doc: PDFKit.PDFDocument;
      try {
        doc = new PDFDocument({
          autoFirstPage: false,
          compress,
          ...(info.language !== undefined && { lang: info.language }),
          info: {
            ...(info.title !== undefined && { Title: info.title }),
            ...(info.author !== undefined && { Author: info.author }),
            ...(info.subject !== undefined && { Subject: info.subject }),
            ...(info.keywords !== undefined && { Keywords: info.keywords.join(', ') }),
            ...(info.creator !== undefined && { Creator: info.creator }),
            Producer: info.producer,
            CreationDate: info.creationDate,
          },
          ...(info.security !== undefined && encryptionOptions(info.security)),
        });
      } catch (error) {
        // SASLprep, which AES-256 passwords go through, refuses control and unassigned characters.
        // Its message names the rule, never the password.
        if (info.security === undefined) throw error;
        const { message } = error as Error;
        throw new Error(`ngpdf: invalid security password (${message})`, { cause: error });
      }
      for (const [name, data] of registered) doc.registerFont(name, data);
      const internals = doc as unknown as PdfKitInternals;
      // PDFKit injects Creator: 'PDFKit' when unset and has no public viewer-preference options.
      if (info.creator === undefined) delete internals.info.Creator;
      if (info.pageMode !== undefined) internals._root.data.PageMode = info.pageMode;
      if (info.pageLayout !== undefined) internals._root.data.PageLayout = info.pageLayout;
      // Byte order, and no inherited keys, so a name such as "__proto__" is kept as written.
      const dests = internals._root.data.Names.data.Dests;
      dests._items = Object.create(null) as Record<string, unknown>;
      dests._compareKeys = compareKeyBytes;
      const outline = info.outline ?? [];
      const places = placesOf(pages);
      const destinations = destinationsOf(pages, places, outline);
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
        for (const [index, page] of pages.entries()) {
          doc.addPage({ size: [page.width, page.height], margin: 0 });
          const links: LinkOp[] = [];
          for (const op of page.ops) drawOp(doc, op, dataUrls, links);
          // After the drawing, when every transform is restored: pdfkit maps an annotation's
          // rect through the current transform.
          for (const link of links) {
            if (link.kind === 'uri') doc.link(link.x, link.y, link.w, link.h, link.url);
            else if (destinations.has(link.name)) {
              doc.goTo(link.x, link.y, link.w, link.h, link.name);
            }
          }
          // pdfkit puts a destination on the current page and flips its y.
          for (const [name, place] of destinations) {
            if (place.page === index)
              internals.addNamedDestination(name, 'XYZ', place.x, place.y, null);
          }
        }
        // pdfkit opens the outline panel whenever there is an outline; that is pageMode's job.
        if (writeOutline(internals, outline, places, pages) && info.pageMode === undefined) {
          internals._root.data.PageMode = 'UseNone';
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
 * Adds the bookmarks under pdfkit's outline root, each open and pointing at its anchor's place:
 * by name when the anchor has one, which is then a named destination, or as an XYZ destination.
 * An entry whose element was never drawn is left out, and its children take its place. Returns
 * whether any entry was written.
 */
function writeOutline(
  internals: PdfKitInternals,
  outline: readonly OutlineItem[],
  places: ReadonlyMap<number, Place>,
  pages: readonly PageOps[],
): boolean {
  const kids = internals._root.data.Pages.data.Kids;
  let written = false;
  const add = (parent: OutlineInternals, items: readonly OutlineItem[]): void => {
    for (const item of items) {
      const place = places.get(item.anchor);
      if (!place) {
        add(parent, item.children);
        continue;
      }
      const entry = parent.addItem(item.title, { expanded: true });
      const height = pages[place.page]?.height ?? 0;
      entry.outlineData.Dest =
        place.name !== undefined
          ? // A String object is written as a PDF string; a primitive would become a PDF name.
            new String(place.name)
          : [kids[place.page], 'XYZ', place.x, height - place.y, null];
      written = true;
      add(entry, item.children);
    }
  };
  add(internals.outline, outline);
  return written;
}

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

// A word and the gap after it; see `wordGaps` in text.ts.
const WORD_AND_GAP = /([^ \u00a0]*)([ \u00a0]*)/g;

/**
 * Justified text, one word at a time. pdfkit's own `wordSpacing` drops a leading space and the
 * kerning across each space, so its words drift from where the layout measured them. Here a word
 * starts where the text through it ends minus its own width, plus `spacing` per gap before it,
 * and each piece's decoration runs on to the next word.
 */
function drawWordSpaced(doc: Doc, op: Extract<DrawOp, { op: 'text' }>, spacing: number): void {
  const pieces: { text: string; x: number }[] = [];
  let gaps = 0;
  // Width of op.text up to `measuredTo`, grown one word at a time. Each step re-measures the
  // character before it so the kerning pair across the boundary still counts.
  let measured = 0;
  let measuredTo = 0;
  for (const match of op.text.matchAll(WORD_AND_GAP)) {
    const [whole, word = '', gap = ''] = match;
    if (whole === '') continue;
    const through = match.index + word.length;
    const from = previousCodePoint(op.text, measuredTo);
    measured +=
      doc.widthOfString(op.text.slice(from, through)) -
      doc.widthOfString(op.text.slice(from, measuredTo));
    measuredTo = through;
    const x = measured - doc.widthOfString(word);
    // A gap alone draws nothing, but keeps its decoration.
    pieces.push({ text: word || whole, x: op.x + x + gaps * spacing });
    if (gap !== '') gaps++;
  }
  const end = op.x + doc.widthOfString(op.text) + gaps * spacing;
  for (const [i, piece] of pieces.entries()) {
    if (piece.text.trim() === '' && !op.underline && !op.strike) continue;
    const width = (pieces[i + 1]?.x ?? end) - piece.x;
    doc.text(piece.text, piece.x, op.y, singleLine(op, width));
  }
}

/**
 * Letter-spaced text is drawn a cluster at a time, so a ligature across two clusters cannot form.
 * It is measured without the optional ones, as CSS turns them off when letters are spaced.
 * fontkit takes a feature object; pdfkit's types only know the list form.
 */
const NO_LIGATURES = {
  liga: false,
  clig: false,
  dlig: false,
} as unknown as PDFKit.Mixins.OpenTypeFeatures[];

/**
 * Letter-spaced text, one grapheme cluster at a time, where the layout measured it. A cluster's
 * advance is the width of it and the next one minus the next one, so the kerning pair between them
 * still counts; then `letter` follows each cluster, and `word` each word gap of justified text.
 * Each piece's decoration runs on to the next one.
 */
function drawLetterSpaced(
  doc: Doc,
  op: Extract<DrawOp, { op: 'text' }>,
  letter: number,
  word: number,
): void {
  const starts = graphemeStarts(op.text);
  const pieces: { text: string; x: number }[] = [];
  let x = op.x;
  let inGap = false;
  for (const [k, start] of starts.entries()) {
    const end = starts[k + 1] ?? op.text.length;
    const cluster = op.text.slice(start, end);
    const gap = cluster === ' ' || cluster === '\u00a0';
    if (inGap && !gap) x += word;
    inGap = gap;
    pieces.push({ text: cluster, x });
    const next = op.text.slice(end, starts[k + 2] ?? op.text.length);
    const width = (part: string) => doc.widthOfString(part, { features: NO_LIGATURES });
    x += width(cluster + next) - width(next) + letter;
  }
  // A gap at the end still counts, as the layout put it before the next run.
  if (inGap) x += word;
  for (const [i, piece] of pieces.entries()) {
    if (piece.text.trim() === '' && !op.underline && !op.strike) continue;
    const width = (pieces[i + 1]?.x ?? x) - piece.x;
    doc.text(piece.text, piece.x, op.y, { ...singleLine(op, width), features: NO_LIGATURES });
  }
}

/** Index of the code point that ends just before `index`, or 0 at the start. */
function previousCodePoint(text: string, index: number): number {
  if (index === 0) return 0;
  const low = text.charCodeAt(index - 1);
  const high = index > 1 ? text.charCodeAt(index - 2) : 0;
  const pair = low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff;
  return pair ? index - 2 : index - 1;
}

function isSquare(radii: Corners<number>): boolean {
  return (
    radii.topLeft === 0 && radii.topRight === 0 && radii.bottomRight === 0 && radii.bottomLeft === 0
  );
}

// Control point distance of a quarter circle drawn as one cubic curve, per unit of radius.
const KAPPA = 0.5522847498;

/** pdfkit's `roundedRect` takes one radius; this one takes four. */
function roundedRect(doc: Doc, op: Clip & { readonly radii: Corners<number> }): void {
  const { x, y, w, h } = op;
  const { topLeft, topRight, bottomRight, bottomLeft } = op.radii;
  const right = x + w;
  const bottom = y + h;
  doc.moveTo(x + topLeft, y);
  doc.lineTo(right - topRight, y);
  corner(doc, right - topRight, y, right, y + topRight, topRight, 'x');
  doc.lineTo(right, bottom - bottomRight);
  corner(doc, right, bottom - bottomRight, right - bottomRight, bottom, bottomRight, 'y');
  doc.lineTo(x + bottomLeft, bottom);
  corner(doc, x + bottomLeft, bottom, x, bottom - bottomLeft, bottomLeft, 'x');
  doc.lineTo(x, y + topLeft);
  corner(doc, x, y + topLeft, x + topLeft, y, topLeft, 'y');
  doc.closePath();
}

/**
 * A quarter circle from (x1, y1) to (x2, y2), leaving along `axis`. Nothing for radius 0: the
 * lines around it already meet at the corner.
 */
function corner(
  doc: Doc,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
  axis: 'x' | 'y',
): void {
  if (radius === 0) return;
  const dx = (x2 - x1) * KAPPA;
  const dy = (y2 - y1) * KAPPA;
  if (axis === 'x') doc.bezierCurveTo(x1 + dx, y1, x2, y2 - dy, x2, y2);
  else doc.bezierCurveTo(x1, y1 + dy, x2 - dx, y2, x2, y2);
}

function outline(doc: Doc, op: Extract<DrawOp, { op: 'rect' }>): void {
  if (isSquare(op.radii)) doc.rect(op.x, op.y, op.w, op.h);
  else roundedRect(doc, op);
}

/**
 * pdfkit stretches the first and last stop to 0 and 1 whatever their offsets, so the engine always
 * sends a first stop at 0 and a last one at 1. Stop opacities below 1 become a soft mask.
 */
function shading(doc: Doc, fill: GradientFill): PDFKit.PDFGradient {
  let gradient: PDFKit.PDFGradient;
  if (fill.kind === 'linear') {
    gradient = doc.linearGradient(fill.x1, fill.y1, fill.x2, fill.y2);
  } else {
    gradient = doc.radialGradient(0, 0, fill.r1, 0, 0, fill.r2);
    (gradient as unknown as GradientTransform).setTransform(1, 0, 0, fill.scaleY, fill.cx, fill.cy);
  }
  for (const stop of fill.stops) gradient.stop(stop.offset, stop.color, stop.opacity);
  return gradient;
}

function pathTo(doc: Doc, segment: PathSegment): void {
  switch (segment.kind) {
    case 'line':
      doc.lineTo(segment.to.x, segment.to.y);
      return;
    case 'curve':
      doc.bezierCurveTo(
        segment.c1.x,
        segment.c1.y,
        segment.c2.x,
        segment.c2.y,
        segment.to.x,
        segment.to.y,
      );
      return;
    default:
      return assertNever(segment);
  }
}

type LinkOp = Extract<DrawOp, { op: 'link' }>;

function drawOp(
  doc: Doc,
  op: DrawOp,
  dataUrls: WeakMap<Uint8Array, string>,
  links: LinkOp[],
): void {
  switch (op.op) {
    case 'rect':
      // Each fill in its own state: a gradient sets no opacity, so it would keep the color's.
      if (op.fill !== undefined) {
        doc.save();
        doc.fillColor(op.fill, op.opacity);
        outline(doc, op);
        doc.fill();
        doc.restore();
      }
      if (op.gradient) {
        doc.save();
        outline(doc, op);
        doc.fill(shading(doc, op.gradient));
        doc.restore();
      }
      return;
    case 'line':
      doc.save();
      doc.lineWidth(op.width).strokeColor(op.color, op.opacity);
      doc.moveTo(op.x1, op.y1).lineTo(op.x2, op.y2).stroke();
      doc.restore();
      return;
    case 'path':
      doc.save();
      doc.lineWidth(op.width).strokeColor(op.color, op.opacity);
      doc.moveTo(op.from.x, op.from.y);
      for (const segment of op.segments) pathTo(doc, segment);
      doc.stroke();
      doc.restore();
      return;
    case 'text':
      doc.save();
      doc.font(op.font).fontSize(op.size).fillColor(op.color, op.opacity);
      if (op.letterSpacing) drawLetterSpaced(doc, op, op.letterSpacing, op.wordSpacing ?? 0);
      else if (op.wordSpacing) drawWordSpaced(doc, op, op.wordSpacing);
      else doc.text(op.text, op.x, op.y, singleLine(op, doc.widthOfString(op.text)));
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
    case 'transform':
      // Restored by the matching untransform, so the ops between are drawn in this space.
      doc.save();
      doc.transform(...op.matrix);
      return;
    case 'untransform':
      doc.restore();
      return;
    case 'clip':
      // Restored by the matching unclip, so the ops between are drawn inside it.
      doc.save();
      if (isSquare(op.radii)) doc.rect(op.x, op.y, op.w, op.h);
      else roundedRect(doc, op);
      doc.clip();
      return;
    case 'unclip':
      doc.restore();
      return;
    case 'link':
      links.push(op);
      return;
    case 'anchor':
      // Placed before the pages are written; see `placesOf`.
      return;
    default:
      return assertNever(op);
  }
}
