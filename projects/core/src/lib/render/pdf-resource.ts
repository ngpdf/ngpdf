import {
  DestroyRef,
  EnvironmentInjector,
  Injector,
  assertInInjectionContext,
  computed,
  inject,
  resource,
  type Resource,
  type Signal,
  type Type,
} from '@angular/core';
import { assertBrowser, isBrowser } from './browser-only';
import { renderToBlob } from './pdf-renderer';

export interface PdfResourceOptions {
  /**
   * The document's inputs, read reactively: the PDF renders again when a signal read here
   * changes. Return `undefined` to hold off rendering; the resource stays `idle` until then.
   */
  readonly inputs?: () => Record<string, unknown> | undefined;
  /** Milliseconds to wait after the last change to `inputs` before rendering. Defaults to 0. */
  readonly debounce?: number;
  /** Needed outside an injection context. The document resolves its services from it. */
  readonly injector?: Injector;
}

export interface PdfResourceRef extends Resource<Blob | undefined> {
  /**
   * An object URL for the current PDF. It stays while a newer render runs, and is revoked when a
   * new PDF replaces it, when a render fails, or on destroy.
   */
  readonly url: Signal<string | undefined>;
  /** Renders again with the same inputs. */
  reload(): boolean;
  /** Stops rendering and revokes the URL. Runs on its own when the injector is destroyed. */
  destroy(): void;
}

/**
 * Renders `component` to a PDF and keeps it current as `inputs` change, built on Angular's
 * `resource()`. A render that is overtaken by a newer one is dropped. On the server it stays
 * `idle` when made in an injection context, and throws when given an `injector`.
 */
export function pdfResource<T>(
  component: Type<T>,
  options: PdfResourceOptions = {},
): PdfResourceRef {
  if (!options.injector) assertInInjectionContext(pdfResource);
  const injector = options.injector ?? inject(Injector);
  // Made by a component or service on the server, as in an SSR page, it stays idle: the page
  // renders, and the browser renders the PDF. A call with an explicit injector has no such page.
  if (options.injector) assertBrowser('pdfResource', injector);
  const browser = isBrowser(injector);
  const environment = injector.get(EnvironmentInjector);
  const debounce = options.debounce ?? 0;
  const inputs = browser ? (options.inputs ?? (() => ({}))) : () => undefined;

  const pdf = resource({
    params: inputs,
    loader: async ({ params, abortSignal }) => {
      if (debounce > 0) await wait(debounce, abortSignal);
      return renderToBlob(component, { inputs: params, injector: environment });
    },
    injector,
  });

  // The URL is made lazily, so a caller that only wants the Blob never holds one.
  let current: string | undefined;
  const revoke = () => {
    if (current) URL.revokeObjectURL(current);
    current = undefined;
  };
  const url = computed(() => {
    // The previous PDF stays until a newer one replaces it, so a preview never goes blank.
    if (pdf.isLoading()) return current;
    const blob = pdf.hasValue() ? pdf.value() : undefined;
    revoke();
    if (blob) current = URL.createObjectURL(blob);
    return current;
  });

  const destroy = () => {
    pdf.destroy();
    revoke();
  };
  injector.get(DestroyRef).onDestroy(revoke);

  return {
    value: pdf.value.asReadonly(),
    status: pdf.status,
    error: pdf.error,
    isLoading: pdf.isLoading,
    get snapshot() {
      return pdf.snapshot;
    },
    hasValue(): this is Resource<Blob> {
      return pdf.hasValue();
    },
    url,
    reload: () => pdf.reload(),
    destroy,
  };
}

/** Resolves after `ms`, or rejects as soon as the render it is holding back is superseded. */
function wait(ms: number, abortSignal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    abortSignal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortSignal.reason as Error);
      },
      { once: true },
    );
  });
}
