import { describeError, readSource } from './images';

/** The bytes of a font source, read like an image `src`, plus a label for messages. */
export async function loadFont(
  src: unknown,
  fetchFn?: typeof fetch,
): Promise<{ readonly label: string; readonly data: Uint8Array }> {
  const source = readSource(src, fetchFn);
  const label = source?.label ?? typeof src;
  try {
    if (!source) throw new Error('src must be a string, Blob, ArrayBuffer or Uint8Array');
    return { label, data: await source.read() };
  } catch (error) {
    throw new Error(`ngpdf: could not load font "${label}": ${describeError(error)}`, {
      cause: error,
    });
  }
}
