import { propsOf, type PdfNode } from '../tree/node';
import type { PdfWriter } from './writer';

export interface ImageAsset {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * Percent-decodes to bytes (not UTF-8 text), leaving a stray `%` as it is. Every character gives
 * at most one byte, so the output is sized to the input and cut to the bytes written. The asset
 * keeps the bytes for the whole render, so when escapes leave more than half the buffer unused
 * the bytes are copied out rather than kept as a view of it.
 */
function percentDecode(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  let length = 0;
  for (let at = 0; at < text.length; at++) {
    const hex = text.slice(at + 1, at + 3);
    if (text[at] === '%' && /^[0-9a-f]{2}$/i.test(hex)) {
      bytes[length++] = parseInt(hex, 16);
      at += 2;
    } else {
      bytes[length++] = text.charCodeAt(at) & 0xff;
    }
  }
  // A copy, so the oversized buffer (escapes make the text longer than the bytes) can be freed.
  return bytes.slice(0, length);
}

function decodeDataUrl(src: string): Uint8Array {
  const comma = src.indexOf(',');
  if (comma < 0) throw new Error('malformed data URL');
  const header = src.slice(5, comma);
  const payload = src.slice(comma + 1);
  if (/;base64$/i.test(header)) {
    return Uint8Array.from(atob(decodeURIComponent(payload)), (ch) => ch.charCodeAt(0));
  }
  return percentDecode(payload);
}

/** The URL without its query string and fragment, which often carry a token, for messages. */
function withoutQuery(url: string): string {
  const cuts = [url.indexOf('?'), url.indexOf('#')].filter((at) => at >= 0);
  return cuts.length > 0 ? url.slice(0, Math.min(...cuts)) : url;
}

async function fetchBytes(url: string, fetchFn: typeof fetch): Promise<Uint8Array> {
  const response = await fetchFn(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * How a server render reads URLs. A server that fetched any URL from a document's data could be
 * pointed at its own internal services (SSRF), so only the app's `fetchImage` reads one.
 */
export interface ServerSources {
  readonly fetchImage?: (url: string) => Promise<Uint8Array>;
}

/** The server's reader for an absolute URL; a relative one has no page to resolve against. */
function serverRead(
  url: string,
  label: string,
  server: ServerSources,
  kind: 'image' | 'font',
): () => Promise<Uint8Array> {
  if (!URL.canParse(url)) throw new Error(`ngpdf: relative ${kind} URL "${label}" on the server`);
  const { fetchImage } = server;
  if (!fetchImage) {
    throw new Error(`ngpdf: remote ${kind} "${label}" refused on the server; pass fetchImage`);
  }
  return () => fetchImage(url);
}

/**
 * Where a source's bytes come from: a label for messages and a reader. Undefined for other types.
 * With `server`, a URL the server may not read throws here, before any load starts.
 */
export function readSource(
  src: unknown,
  fetchFn: typeof fetch | undefined,
  server?: ServerSources,
  kind: 'image' | 'font' = 'image',
): { label: string; read: () => Promise<Uint8Array> | Uint8Array } | undefined {
  // URL schemes are case-insensitive, so `DATA:` and `Data:` are data URLs too.
  if (typeof src === 'string' && src.slice(0, 5).toLowerCase() === 'data:') {
    return { label: 'data URL', read: () => decodeDataUrl(src) };
  }
  if (typeof src === 'string') {
    const label = withoutQuery(src);
    if (server) return { label, read: serverRead(src, label, server, kind) };
    return { label, read: () => fetchBytes(src, fetchFn ?? ((...args) => fetch(...args))) };
  }
  if (src instanceof Blob) {
    return { label: 'Blob', read: async () => new Uint8Array(await src.arrayBuffer()) };
  }
  if (src instanceof ArrayBuffer) return { label: 'ArrayBuffer', read: () => new Uint8Array(src) };
  if (src instanceof Uint8Array) return { label: 'Uint8Array', read: () => src };
  return undefined;
}

async function loadOne(
  src: unknown,
  writer: Pick<PdfWriter, 'imageSize'>,
  fetchFn: typeof fetch | undefined,
  server: ServerSources | undefined,
): Promise<ImageAsset> {
  const source = src instanceof Uint8Array ? undefined : readSource(src, fetchFn, server);
  const label = source?.label ?? typeof src;
  try {
    if (!source) throw new Error('src must be a string, Blob or ArrayBuffer');
    const data = await source.read();
    return { data, ...writer.imageSize(data) };
  } catch (error) {
    throw new Error(`ngpdf: could not load image "${label}": ${describeError(error)}`, {
      cause: error,
    });
  }
}

/** Loads every `pdf-image` under `root` in parallel; the first failure rejects. */
export async function loadImages(
  root: PdfNode,
  writer: Pick<PdfWriter, 'imageSize'>,
  fetchFn?: typeof fetch,
  server?: ServerSources,
): Promise<Map<PdfNode, ImageAsset>> {
  const nodes: PdfNode[] = [];
  const visit = (node: PdfNode): void => {
    if (node.kind !== 'element') return;
    if (node.tag === 'pdf-image') nodes.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  // One load per distinct string `src`, so a logo used ten times is fetched once.
  const shared = new Map<string, Promise<ImageAsset>>();
  const loadNode = (node: PdfNode): Promise<ImageAsset> => {
    const src = propsOf(node)['src'];
    if (typeof src !== 'string') return loadOne(src, writer, fetchFn, server);
    let pending = shared.get(src);
    if (!pending) {
      pending = loadOne(src, writer, fetchFn, server);
      shared.set(src, pending);
    }
    return pending;
  };
  const entries = await Promise.all(
    nodes.map(async (node) => [node, await loadNode(node)] as const),
  );
  return new Map(entries);
}

/** The image rectangle inside `box`; `cover` overflows it and the display list clips. */
export function fitImage(
  asset: ImageAsset,
  box: { w: number; h: number },
  fit: 'contain' | 'cover',
): { x: number; y: number; w: number; h: number } {
  const scaleX = box.w / asset.width;
  const scaleY = box.h / asset.height;
  const scale = fit === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
  const w = asset.width * scale;
  const h = asset.height * scale;
  return { x: (box.w - w) / 2, y: (box.h - h) / 2, w, h };
}
