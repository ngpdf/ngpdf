import { propsOf, type PdfNode } from '../../tree/node';
import type { Color } from '../color';
import { describeError, readSource, type ServerSources } from '../images';
import { compileSvg, type SvgAsset } from './render';
import { parseXml, type XmlElement } from './xml';

/** The longest SVG source, in UTF-8 bytes; longer throws. */
export const MAX_SVG_BYTES = 1_048_576;

const BLACK: Color = { r: 0, g: 0, b: 0, a: 1 };

function tooLarge(): never {
  throw new Error(`ngpdf: pdf-svg source is larger than ${String(MAX_SVG_BYTES)} bytes`);
}

/** Markup in a string: what is not a URL. A URL never starts with `<`. */
const isMarkup = (src: string): boolean => src.trimStart().startsWith('<');

/** The UTF-8 length of `text`, without encoding past the limit. */
function checkMarkupSize(text: string): void {
  // Each UTF-16 unit is at least one UTF-8 byte.
  if (text.length > MAX_SVG_BYTES) tooLarge();
  if (new TextEncoder().encode(text).byteLength > MAX_SVG_BYTES) tooLarge();
}

async function parseSource(
  src: unknown,
  warn: (message: string) => void,
  fetchFn: typeof fetch | undefined,
  server: ServerSources | undefined,
  maxBytes: number | undefined,
): Promise<XmlElement> {
  if (typeof src === 'string' && isMarkup(src)) {
    checkMarkupSize(src);
    return parseXml(src, warn);
  }
  const source =
    typeof src === 'string' || src instanceof Blob
      ? readSource(src, fetchFn, server, 'SVG', maxBytes)
      : undefined;
  const label = source?.label ?? typeof src;
  let bytes: Uint8Array;
  try {
    if (!source) throw new Error('src must be SVG markup, a URL or a Blob');
    bytes = await source.read();
  } catch (error) {
    throw new Error(`ngpdf: could not load SVG "${label}": ${describeError(error, src, label)}`, {
      cause: error,
    });
  }
  if (bytes.byteLength > MAX_SVG_BYTES) tooLarge();
  // A byte order mark is dropped; a bad byte becomes U+FFFD, which only text could hold.
  return parseXml(new TextDecoder('utf-8').decode(bytes), warn);
}

export interface LoadedSvgs {
  readonly svgs: Map<PdfNode, SvgAsset>;
  /** The parses this call started, by `src`, for a later call's `known`. */
  readonly loads: ReadonlyMap<unknown, Promise<XmlElement>>;
}

/**
 * Loads and parses every `pdf-svg` under `root` in parallel; the first failure rejects. Each
 * distinct `src` is read and parsed once, and drawn with each element's own `color` for
 * `currentColor`. URLs are read like images: on the server through `fetchImage` only, and capped
 * by `maxBytes`. A `src` in `known` is not read again.
 */
export async function loadSvgs(
  root: PdfNode,
  styles: ReadonlyMap<PdfNode, { readonly color: Color }>,
  warn: (message: string) => void,
  fetchFn?: typeof fetch,
  server?: ServerSources,
  maxBytes?: number,
  known: ReadonlyMap<unknown, Promise<XmlElement>> = new Map(),
): Promise<LoadedSvgs> {
  const nodes: PdfNode[] = [];
  const visit = (node: PdfNode): void => {
    if (node.kind !== 'element') return;
    if (node.tag === 'pdf-svg') nodes.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  const loads = new Map<unknown, Promise<XmlElement>>();
  const parsed = (src: unknown): Promise<XmlElement> => {
    let pending = known.get(src) ?? loads.get(src);
    if (!pending) {
      pending = parseSource(src, warn, fetchFn, server, maxBytes);
      loads.set(src, pending);
    }
    return pending;
  };
  const entries = await Promise.all(
    nodes.map(async (node) => {
      const tree = await parsed(propsOf(node)['src']);
      return [node, compileSvg(tree, styles.get(node)?.color ?? BLACK, warn)] as const;
    }),
  );
  return { svgs: new Map(entries), loads };
}
