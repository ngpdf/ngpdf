// ng-packagr compiles from the entry point, so the ambient module declarations are named here.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./pdfkit-standard-fonts.d.ts" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./linebreak.d.ts" />
import { elementChildren, propsOf, type PdfNode } from '../tree/node';
import { displayList } from './display-list';
export { loadFont } from './font-loading';
import { parseFontFamily, type FontRegistry, type RegisteredFace } from './fonts';
import { dissolveHosts } from './hosts';
import { loadImages } from './images';
import type { LayoutContext } from './layout';
import { paginatePage } from './paginate';
import { resolveStyles } from './style';
import { TextMeasureCache } from './text';
import {
  createPdfkitWriter,
  type CustomFont,
  type DocumentInfo,
  type PageOps,
  type PdfWriter,
} from './writer';
import type { Yoga } from 'yoga-layout/load';

declare const ngDevMode: unknown;

export interface RenderDocumentOptions {
  /** Emit the render's warnings with `console.warn`. Defaults to Angular's dev-mode check. */
  readonly dev?: boolean;
  /** Replaces the pdfkit writer; tests use it to see what the engine hands over. */
  readonly writer?: PdfWriter;
  /** Font faces for `font-family`; only those of families the document names are loaded. */
  readonly fonts?: readonly FontSource[];
}

/** One face of a font family, with a way to get its bytes. */
export interface FontSource {
  readonly family: string;
  readonly weight?: 'normal' | 'bold';
  readonly style?: 'normal' | 'italic';
  /** The bytes, and a label for them (the URL, "Blob", …) for error messages. */
  readonly load: () => Promise<{ readonly label: string; readonly data: Uint8Array }>;
}

const familyKey = (family: string): string => family.trim().toLowerCase();

/**
 * Loads the faces of the families that some `font-family` in the document names, registers each
 * with the writer as `font:<index>` and groups them by family. A font the document never names is
 * never fetched, so a broken one cannot fail an unrelated render.
 */
async function registerUsedFonts(
  sources: readonly FontSource[],
  styles: ReadonlyMap<PdfNode, { readonly fontFamily: string }>,
  writer: PdfWriter,
): Promise<FontRegistry> {
  const named = new Set<string>();
  for (const style of new Set([...styles.values()].map((resolved) => resolved.fontFamily))) {
    for (const name of parseFontFamily(style)) named.add(familyKey(name));
  }
  const used = sources.filter((source) => named.has(familyKey(source.family)));
  const loaded = await Promise.all(
    used.map(async (source) => ({ source, ...(await source.load()) })),
  );
  const registry = new Map<string, RegisteredFace[]>();
  loaded.forEach(({ source, label, data }, index) => {
    const font: CustomFont = `font:${String(index)}`;
    try {
      writer.registerFont(font, data);
    } catch {
      throw new Error(`ngpdf: invalid font "${label}"`);
    }
    const key = familyKey(source.family);
    const faces = registry.get(key) ?? [];
    faces.push({ weight: source.weight ?? 'normal', style: source.style ?? 'normal', font });
    registry.set(key, faces);
  });
  return registry;
}

// The one piece of module state: the Yoga WebAssembly module is compiled once per page load.
let yogaLoading: Promise<Yoga> | undefined;

function loadYogaOnce(): Promise<Yoga> {
  yogaLoading ??= import('yoga-layout/load')
    .then(({ loadYoga }) => loadYoga())
    .catch((error: unknown) => {
      yogaLoading = undefined;
      throw error;
    });
  return yogaLoading;
}

function findDocument(node: PdfNode): PdfNode | undefined {
  if (node.kind !== 'element') return undefined;
  if (node.tag === 'pdf-document') return node;
  for (const child of node.children) {
    const found = findDocument(child);
    if (found) return found;
  }
  return undefined;
}

function infoOf(document: PdfNode, now: Date): DocumentInfo {
  const props = propsOf(document);
  const text = (name: string): string | undefined => {
    const value = props[name];
    return typeof value === 'string' ? value : undefined;
  };
  const title = text('title');
  const author = text('author');
  const subject = text('subject');
  const keywords = props['keywords'];
  const date = props['creationDate'];
  return {
    ...(title !== undefined && { title }),
    ...(author !== undefined && { author }),
    ...(subject !== undefined && { subject }),
    ...(Array.isArray(keywords) && { keywords: keywords as readonly string[] }),
    creationDate: date instanceof Date ? date : now,
  };
}

/**
 * Lays out, paginates and writes the document under `root` (the host element from `renderTree`).
 * Warnings of one render are collected once each and printed at the end, in dev mode only.
 */
export async function renderDocument(
  root: PdfNode,
  options: RenderDocumentOptions = {},
): Promise<Blob> {
  // The clock is read once, so every use of "now" in one render agrees.
  const now = new Date();
  const dev = options.dev ?? (typeof ngDevMode === 'undefined' || !!ngDevMode);
  const document = findDocument(root);
  if (!document) throw new Error('ngpdf: no pdf-document in the rendered component');

  const warnings = new Set<string>();
  const warn = (message: string): void => {
    warnings.add(message);
  };
  // One message for the whole render, naming every distinct character once.
  const replaced = new Set<string>();
  const warnChars = (chars: string[]): void => {
    for (const char of chars) replaced.add(char);
  };
  const missing = new Set<string>();
  const warnMissing = (chars: string[]): void => {
    for (const char of chars) missing.add(char);
  };

  const [yoga, writer] = await Promise.all([
    loadYogaOnce(),
    options.writer ?? createPdfkitWriter({ compress: true }),
  ]);
  try {
    // Component hosts are transparent: the stages below see only pdf-* elements.
    const tree = dissolveHosts(document, warn);
    const styles = resolveStyles(tree, warn);
    const [images, fonts] = await Promise.all([
      loadImages(tree, writer),
      registerUsedFonts(options.fonts ?? [], styles, writer),
    ]);
    // One text cache per render, passed down like the metrics and images, so renders share nothing.
    const textCache = new TextMeasureCache();
    const ctx: LayoutContext = {
      yoga,
      metrics: writer,
      images,
      warn,
      warnChars,
      textCache,
      fonts,
      warnMissing,
    };

    const layouts = elementChildren(tree)
      .filter((child) => child.tag === 'pdf-page')
      .flatMap((child) => paginatePage(child, styles, ctx));
    const pages: PageOps[] = layouts.map((layout, index) => ({
      width: layout.width,
      height: layout.height,
      ops: displayList(layout, index, layouts.length, undefined, {
        metrics: writer,
        warn: warnChars,
        fonts,
        warnMissing,
      }),
    }));
    return await writer.write(pages, infoOf(document, now));
  } finally {
    // Also on failure: a warning often explains why the render broke.
    if (replaced.size > 0) {
      warn(`ngpdf: characters outside WinAnsi replaced with "?": ${[...replaced].join('')}`);
    }
    if (missing.size > 0) {
      warn(
        `ngpdf: characters missing from every font in their font-family, drawn as an empty box: ${[...missing].join('')}`,
      );
    }
    if (dev) for (const message of warnings) console.warn(message);
  }
}
