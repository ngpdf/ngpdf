import { DOCUMENT, EnvironmentInjector, Service, inject, type Type } from '@angular/core';
import { PDF_FONT_SET } from './pdf-fonts';
import { PDF_HYPHENATE } from './pdf-hyphenation';
import { renderTree } from './render-tree';

export interface RenderOptions {
  /** Values for the document component's inputs, by input name. */
  readonly inputs?: Record<string, unknown>;
}

export interface DownloadOptions extends RenderOptions {
  readonly fileName: string;
}

export interface RenderToBlobOptions extends RenderOptions {
  /** The injector the document component resolves its dependencies from. */
  readonly injector: EnvironmentInjector;
}

export interface DownloadPdfOptions extends DownloadOptions {
  readonly injector: EnvironmentInjector;
}

// The engine is its own chunk. A failed load clears the memo so the next render retries.
let engine: Promise<typeof import('../engine')> | undefined;
function loadEngine(): Promise<typeof import('../engine')> {
  engine ??= import('../engine').catch((error: unknown) => {
    engine = undefined;
    throw error;
  });
  return engine;
}

/**
 * Renders `component` to a PDF. Each call gets its own tree and injector, and the component is
 * destroyed when the render settles, so concurrent calls share nothing.
 */
export async function renderToBlob<T>(
  component: Type<T>,
  options: RenderToBlobOptions,
): Promise<Blob> {
  const tree = renderTree(component, options.injector, options.inputs);
  try {
    const loaded = await loadEngine();
    const fonts = options.injector.get(PDF_FONT_SET, null)?.sources((src) => loaded.loadFont(src));
    const hyphenate = options.injector.get(PDF_HYPHENATE, null);
    return await loaded.renderDocument(tree.root, {
      fonts: fonts ?? [],
      ...(hyphenate && { hyphenate }),
    });
  } finally {
    tree.destroy();
  }
}

/** Renders `component` and saves the PDF through a temporary `<a download>`. */
export async function downloadPdf<T>(
  component: Type<T>,
  options: DownloadPdfOptions,
): Promise<void> {
  const blob = await renderToBlob(component, options);
  const doc = options.injector.get(DOCUMENT);
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = options.fileName;
  doc.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Some browsers cancel a download whose URL is revoked in the same tick.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }
}

/** Facade over the render pipeline: `inject(PdfRenderer).toBlob(Doc)` or `.download(Doc, …)`. */
@Service()
export class PdfRenderer {
  private readonly injector = inject(EnvironmentInjector);

  toBlob<T>(component: Type<T>, options: RenderOptions = {}): Promise<Blob> {
    return renderToBlob(component, { ...options, injector: this.injector });
  }

  download<T>(component: Type<T>, options: DownloadOptions): Promise<void> {
    return downloadPdf(component, { ...options, injector: this.injector });
  }
}
