import { vi } from 'vitest';

// Yoga's Emscripten loader fetches its WebAssembly, inlined as a data URL, through the global
// fetch the first time a spec file lays a document out.
const YOGA_WASM = 'data:application/octet-stream;base64,';

/**
 * Stubs the global fetch with `fetchFn`, except for Yoga's WebAssembly, which still goes to the
 * real fetch. A plain stub would also get Yoga's request when its test is the first in the file
 * to render, so the test would pass or fail by the order the tests run in.
 */
export function stubFetch(fetchFn: (...args: never[]) => unknown): void {
  const realFetch = globalThis.fetch;
  const stub = fetchFn as (...args: Parameters<typeof fetch>) => unknown;
  vi.stubGlobal('fetch', (...args: Parameters<typeof fetch>) =>
    typeof args[0] === 'string' && args[0].startsWith(YOGA_WASM)
      ? realFetch(...args)
      : stub(...args),
  );
}
