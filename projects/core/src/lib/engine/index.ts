// ng-packagr compiles from the entry point, so the ambient module declarations are named here.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./pdfkit-standard-fonts.d.ts" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./linebreak.d.ts" />
import { elementChildren, propsOf, type PdfNode } from '../tree/node';
import { displayList } from './display-list';
import { dissolveHosts } from './hosts';
import { loadImages } from './images';
import type { LayoutContext } from './layout';
import { paginatePage } from './paginate';
import { resolveStyles } from './style';
import { createPdfkitWriter, type DocumentInfo, type PageOps, type PdfWriter } from './writer';
import type { Yoga } from 'yoga-layout/load';

declare const ngDevMode: unknown;

export interface RenderDocumentOptions {
  /** Emit the render's warnings with `console.warn`. Defaults to Angular's dev-mode check. */
  readonly dev?: boolean;
  /** Replaces the pdfkit writer; tests use it to see what the engine hands over. */
  readonly writer?: PdfWriter;
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

  const [yoga, writer] = await Promise.all([
    loadYogaOnce(),
    options.writer ?? createPdfkitWriter({ compress: true }),
  ]);
  try {
    // Component hosts are transparent: the stages below see only pdf-* elements.
    const tree = dissolveHosts(document, warn);
    const styles = resolveStyles(tree, warn);
    const images = await loadImages(tree, writer);
    const ctx: LayoutContext = { yoga, metrics: writer, images, warn, warnChars };

    const layouts = elementChildren(tree)
      .filter((child) => child.tag === 'pdf-page')
      .flatMap((child) => paginatePage(child, styles, ctx));
    const pages: PageOps[] = layouts.map((layout, index) => ({
      width: layout.width,
      height: layout.height,
      ops: displayList(layout, index, layouts.length, undefined, {
        metrics: writer,
        warn: warnChars,
      }),
    }));
    return await writer.write(pages, infoOf(document, now));
  } finally {
    // Also on failure: a warning often explains why the render broke.
    if (replaced.size > 0) {
      warn(`ngpdf: characters outside WinAnsi replaced with "?": ${[...replaced].join('')}`);
    }
    if (dev) for (const message of warnings) console.warn(message);
  }
}
