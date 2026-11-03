// ng-packagr compiles from the entry point, so the ambient module declarations are named here.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./pdfkit-standard-fonts.d.ts" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./linebreak.d.ts" />
import { elementChildren, propsOf, type PdfNode } from '../tree/node';
import type { RenderPerSheet } from '../tree/per-sheet';
import { collectAnchors } from './anchors';
import type { ShapeOp } from './canvas-recorder';
import { displayList, paintCanvases } from './display-list';
export { loadFont } from './font-loading';
import { loadEmoji, type EmojiSource } from './emoji';
import { parseFontFamily, type RegisteredFace } from './fonts';
import { dissolveHosts } from './hosts';
import { loadImages, type ServerSources } from './images';
import type { Box, LayoutContext } from './layout';
import {
  fixedViewWidth,
  paginatePage,
  type PageLayout as SheetLayout,
  type PlacedBox,
} from './paginate';
import {
  fillSlots,
  marksOf,
  placeSheetView,
  reserveSheets,
  sheetContext,
  type PerSheetView,
} from './per-sheet';
import { securityOf } from './security';
import { resolveStyles } from './style';
import { TextMeasureCache, type Hyphenate } from './text';
import {
  createPdfkitWriter,
  type CustomFont,
  type DocumentInfo,
  type PageOps,
  type PdfWriter,
} from './writer';
import type { Yoga } from 'yoga-layout/load';

import type { PageLayout, PageMode } from '../tree/viewer-preferences';

const PAGE_MODES = [
  'UseNone',
  'UseOutlines',
  'UseThumbs',
  'FullScreen',
] as const satisfies readonly PageMode[];
const PAGE_LAYOUTS = [
  'SinglePage',
  'OneColumn',
  'TwoColumnLeft',
  'TwoColumnRight',
  'TwoPageLeft',
  'TwoPageRight',
] as const satisfies readonly PageLayout[];

declare const ngDevMode: unknown;

export interface RenderDocumentOptions {
  /** Emit the render's warnings with `console.warn`. Defaults to Angular's dev-mode check. */
  readonly dev?: boolean;
  /** Replaces the pdfkit writer; tests use it to see what the engine hands over. */
  readonly writer?: PdfWriter;
  /** Font faces for `font-family`; only those of families the document names are loaded. */
  readonly fonts?: readonly FontSource[];
  /** The app's hyphenation function, for `hyphens: auto`; called with the document's language. */
  readonly hyphenate?: Hyphenate;
  /** Set on the server: URLs are read only through its `fetchImage`, and a relative one throws. */
  readonly server?: ServerSources;
  /** Where emoji images come from; without it, emoji are text like any other character. */
  readonly emoji?: EmojiSource;
  /** Renders a `pdfPerSheet` template for one sheet; the eager half passes it. */
  readonly perSheet?: RenderPerSheet;
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
 * Loads the faces of the families that some `font-family` in `styles` names and `registry` does
 * not hold yet, registers each with the writer as `font:<index>` and adds them to `registry` by
 * family. A font the document never names is never fetched, so a broken one cannot fail an
 * unrelated render. Called again with the styles of each sheet's `pdfPerSheet` content.
 */
async function registerUsedFonts(
  sources: readonly FontSource[],
  styles: ReadonlyMap<PdfNode, { readonly fontFamily: string }>,
  writer: PdfWriter,
  registry: Map<string, RegisteredFace[]>,
): Promise<void> {
  const named = new Set<string>();
  for (const style of new Set([...styles.values()].map((resolved) => resolved.fontFamily))) {
    for (const name of parseFontFamily(style)) named.add(familyKey(name));
  }
  const used = sources.filter((source) => {
    const key = familyKey(source.family);
    return named.has(key) && !registry.has(key);
  });
  if (used.length === 0) return;
  const loaded = await Promise.all(
    used.map(async (source) => ({ source, ...(await source.load()) })),
  );
  let index = [...registry.values()].reduce((count, faces) => count + faces.length, 0);
  for (const { source, label, data } of loaded) {
    const font: CustomFont = `font:${String(index++)}`;
    try {
      writer.registerFont(font, data);
    } catch {
      throw new Error(`ngpdf: invalid font "${label}"`);
    }
    const key = familyKey(source.family);
    const faces = registry.get(key) ?? [];
    faces.push({ weight: source.weight ?? 'normal', style: source.style ?? 'normal', font });
    registry.set(key, faces);
  }
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

function enumValue<T extends string>(
  value: unknown,
  name: 'pageMode' | 'pageLayout',
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    const shown = typeof value === 'string' ? value : typeof value;
    throw new Error(`ngpdf: invalid ${name} "${shown}"`);
  }
  return value as T;
}

function languageOf(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('ngpdf: invalid language');
  try {
    const language = Intl.getCanonicalLocales(value)[0];
    if (language === undefined) throw new Error();
    return language;
  } catch {
    throw new Error(`ngpdf: invalid language "${value}"`);
  }
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
  const creator = text('creator');
  const producer = text('producer');
  const keywords = props['keywords'];
  const date = props['creationDate'];
  const language = languageOf(props['language']);
  const pageMode = enumValue(props['pageMode'], 'pageMode', PAGE_MODES);
  const pageLayout = enumValue(props['pageLayout'], 'pageLayout', PAGE_LAYOUTS);
  const security = securityOf(props['security']);
  return {
    ...(title !== undefined && { title }),
    ...(author !== undefined && { author }),
    ...(subject !== undefined && { subject }),
    ...(Array.isArray(keywords) && { keywords: keywords as readonly string[] }),
    ...(language !== undefined && { language }),
    ...(creator !== undefined && { creator }),
    producer: producer ?? 'ngpdf',
    ...(pageMode !== undefined && { pageMode }),
    ...(pageLayout !== undefined && { pageLayout }),
    creationDate: date instanceof Date ? date : now,
    ...(security !== undefined && { security }),
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
  // Debug outlines are for looking at a layout, not for a file to ship.
  const debug = propsOf(document)['debug'] === true;
  if (debug) warn('ngpdf: debug outlines are on');
  try {
    // Component hosts are transparent: the stages below see only pdf-* elements.
    const dissolved = dissolveHosts(document, warn);
    // Before layout: a link to "#name" is checked against every name in the document. Taken
    // before pdfPerSheet templates render, so an anchor inside one is not collected.
    const collected = collectAnchors(dissolved, warn);
    // Each pdfPerSheet template renders once here, and its fixed view reserves that height.
    const { tree, views, origins } = options.perSheet
      ? reserveSheets(dissolved, options.perSheet, warn)
      : { tree: dissolved, views: new Map<PdfNode, PerSheetView>(), origins: new Map() };
    const anchors = marksOf(origins, collected);
    const styles = resolveStyles(tree, warn);
    const fonts = new Map<string, RegisteredFace[]>();
    // Emoji images load with the others, before layout, so measuring stays synchronous.
    const [{ images, loads }, , found] = await Promise.all([
      loadImages(tree, writer, undefined, options.server),
      registerUsedFonts(options.fonts ?? [], styles, writer, fonts),
      loadEmoji(tree, options.emoji, writer, warn, undefined, options.server),
    ]);
    // Image loads and emoji tried so far; a pdfPerSheet sheet's content loads only new ones.
    const imageLoads = new Map(loads);
    const seenEmoji = new Set(found.tried);
    const emoji = new Map(found.images);
    // One text cache per render, passed down like the metrics and images, so renders share nothing.
    const language = languageOf(propsOf(document)['language']);
    const textCache = new TextMeasureCache({
      ...(options.hyphenate && { hyphenate: options.hyphenate }),
      ...(language !== undefined && { language }),
      warn,
    });
    const ctx: LayoutContext = {
      yoga,
      metrics: writer,
      images,
      warn,
      warnChars,
      textCache,
      fonts,
      warnMissing,
      anchors,
      debug,
      emoji,
    };

    const sheets = elementChildren(tree)
      .filter((child) => child.tag === 'pdf-page')
      .flatMap((child) => paginatePage(child, styles, ctx));
    let warnedTaller = false;
    // A pdfPerSheet view renders, lays out and is drawn one sheet at a time, so the eager half
    // holds at most one view per template.
    const perSheetView = async (
      placed: PlacedBox,
      view: PerSheetView,
      render: RenderPerSheet,
      sheet: number,
    ): Promise<PlacedBox> => {
      const context = sheetContext(sheet, sheets.length, view.pageNumber);
      const filled = fillSlots(view.template, view.page, context, render, warn);
      const pageStyle = styles.get(view.page);
      if (!pageStyle) throw new Error('ngpdf: no resolved style for <pdf-page>');
      const viewStyles = resolveStyles(filled.view, warn, { style: pageStyle, depth: 3 });
      const [viewImages, , viewEmoji] = await Promise.all([
        loadImages(filled.view, writer, undefined, options.server, imageLoads),
        registerUsedFonts(options.fonts ?? [], viewStyles, writer, fonts),
        loadEmoji(filled.view, options.emoji, writer, warn, undefined, options.server, seenEmoji),
      ]);
      for (const [src, load] of viewImages.loads) imageLoads.set(src, load);
      for (const sequence of viewEmoji.tried) seenEmoji.add(sequence);
      for (const [sequence, asset] of viewEmoji.images) emoji.set(sequence, asset);
      const width = fixedViewWidth(view.page, pageStyle, viewStyles.get(filled.view));
      const viewCtx: LayoutContext = {
        ...ctx,
        images: viewImages.images,
        anchors: marksOf(filled.origins, collected),
      };
      return placeSheetView(placed, filled.view, viewStyles, width, viewCtx, () => {
        if (warnedTaller) return;
        warnedTaller = true;
        warn(
          `ngpdf: pdfPerSheet content is taller on sheet ${String(sheet)} than on the first; set a height on the fixed view`,
        );
      });
    };
    const sheetOf = async (layout: SheetLayout, sheet: number): Promise<SheetLayout> => {
      const render = options.perSheet;
      if (!render || views.size === 0) return layout;
      const placed: PlacedBox[] = [];
      for (const item of layout.placed) {
        const view = views.get(item.box.node);
        placed.push(view ? await perSheetView(item, view, render, sheet) : item);
      }
      return { ...layout, placed };
    };
    // Shared by every sheet: a canvas drawn on several sheets reuses its shapes.
    const canvases = new Map<Box, readonly ShapeOp[]>();
    const pages: PageOps[] = [];
    for (const [index, sheet] of sheets.entries()) {
      const layout = await sheetOf(sheet, index + 1);
      for (const [box, shapes] of paintCanvases([layout], canvases)) canvases.set(box, shapes);
      pages.push({
        width: layout.width,
        height: layout.height,
        ops: displayList(layout, index, sheets.length, undefined, {
          metrics: writer,
          warn: warnChars,
          fonts,
          warnMissing,
          debug,
          canvases,
        }),
      });
    }
    const info = infoOf(document, now);
    const { outline } = anchors;
    return await writer.write(pages, outline.length > 0 ? { ...info, outline } : info);
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
