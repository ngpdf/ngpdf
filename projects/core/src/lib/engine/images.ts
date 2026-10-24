import { propsOf, type PdfNode } from '../tree/node';
import type { PdfWriter } from './writer';

export interface ImageAsset {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

function describe(reason: unknown): string {
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
  return length * 2 < bytes.length ? bytes.slice(0, length) : bytes.subarray(0, length);
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

async function loadOne(
  src: unknown,
  writer: Pick<PdfWriter, 'imageSize'>,
  fetchFn: typeof fetch | undefined,
): Promise<ImageAsset> {
  let label: string;
  let read: () => Promise<Uint8Array> | Uint8Array;
  if (typeof src === 'string' && src.startsWith('data:')) {
    label = 'data URL';
    read = () => decodeDataUrl(src);
  } else if (typeof src === 'string') {
    label = withoutQuery(src);
    read = () => fetchBytes(src, fetchFn ?? ((...args) => fetch(...args)));
  } else if (src instanceof Blob) {
    label = 'Blob';
    read = async () => new Uint8Array(await src.arrayBuffer());
  } else if (src instanceof ArrayBuffer) {
    label = 'ArrayBuffer';
    read = () => new Uint8Array(src);
  } else {
    label = typeof src;
    read = () => {
      throw new Error('src must be a string, Blob or ArrayBuffer');
    };
  }
  try {
    const data = await read();
    return { data, ...writer.imageSize(data) };
  } catch (error) {
    throw new Error(`ngpdf: could not load image "${label}": ${describe(error)}`, {
      cause: error,
    });
  }
}

/** Loads every `pdf-image` under `root` in parallel; the first failure rejects. */
export async function loadImages(
  root: PdfNode,
  writer: Pick<PdfWriter, 'imageSize'>,
  fetchFn?: typeof fetch,
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
    if (typeof src !== 'string') return loadOne(src, writer, fetchFn);
    let pending = shared.get(src);
    if (!pending) {
      pending = loadOne(src, writer, fetchFn);
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
