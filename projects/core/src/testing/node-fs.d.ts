// The projects build with `types: []`; the font fixtures need this one Node call.
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}
