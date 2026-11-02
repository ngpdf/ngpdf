// The projects build with `types: []`; the PNG fixtures need this one Node call.
declare module 'node:zlib' {
  export function deflateSync(data: Uint8Array): Uint8Array;
}

declare module 'node:stream/web' {
  export const ReadableStream: unknown;
  export const DecompressionStream: unknown;
}
