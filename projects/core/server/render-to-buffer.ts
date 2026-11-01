import {
  DOCUMENT,
  Injector,
  createEnvironmentInjector,
  provideZonelessChangeDetection,
  ɵINJECTOR_SCOPE as INJECTOR_SCOPE,
  type EnvironmentInjector,
  type EnvironmentProviders,
  type Provider,
  type Type,
} from '@angular/core';
import { ɵrenderPdf as renderPdf } from '@ngpdf/core';

export interface RenderToBufferOptions {
  /** Values for the document component's inputs, by input name. */
  readonly inputs?: Record<string, unknown>;
  /** Providers for the document, such as `providePdfFonts([...])`. */
  readonly providers?: readonly (Provider | EnvironmentProviders)[];
  /**
   * The injector the document resolves its services from, such as an Angular SSR app's. Without
   * it, the document gets an injector of its own with only `providers`.
   */
  readonly injector?: EnvironmentInjector;
  /**
   * Reads an absolute image or font URL. Without it the server refuses them: a URL taken from a
   * document's data could point the server at its own internal services (SSRF).
   */
  readonly fetchImage?: (url: string) => Promise<Uint8Array>;
}

/**
 * What a root injector needs to create a component in Node. The root scope is what an app's
 * bootstrap gives its root injector, so `providedIn: 'root'` services resolve; Angular has no
 * public provider for it. Creating any component reads `DOCUMENT` once to find where styles go,
 * and a PDF's elements have no styles, so an empty object stands in for it.
 */
const STANDALONE_ROOT: (Provider | EnvironmentProviders)[] = [
  { provide: INJECTOR_SCOPE, useValue: 'root' },
  { provide: DOCUMENT, useValue: {} },
  provideZonelessChangeDetection(),
];

/** The injector a render runs under, and whether it is ours to destroy. */
function injectorFor(options: RenderToBufferOptions): {
  injector: EnvironmentInjector;
  owned: boolean;
} {
  const providers = options.providers ?? [];
  if (options.injector) {
    if (providers.length === 0) return { injector: options.injector, owned: false };
    return { injector: createEnvironmentInjector([...providers], options.injector), owned: true };
  }
  // createEnvironmentInjector only reads its parent, which has nothing for a root to find.
  const parent = Injector.NULL as EnvironmentInjector;
  return {
    injector: createEnvironmentInjector([...STANDALONE_ROOT, ...providers], parent),
    owned: true,
  };
}

/**
 * Renders `component` to PDF bytes on the server, with no DOM: in a plain Node script or an
 * Angular SSR route. Each call has its own injector, tree and writer, so concurrent calls share
 * nothing. A `Uint8Array` is what Node's `Buffer` extends, so the result goes straight to
 * `res.end()` or `fs.writeFile()`.
 */
export async function renderToBuffer<T>(
  component: Type<T>,
  options: RenderToBufferOptions = {},
): Promise<Uint8Array> {
  const { injector, owned } = injectorFor(options);
  try {
    const blob = await renderPdf(component, injector, options.inputs, {
      ...(options.fetchImage && { fetchImage: options.fetchImage }),
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    if (owned) injector.destroy();
  }
}
