import { readFileSync } from 'node:fs';

/**
 * OFL-licensed subsets in `testing/fonts` (see the README there):
 * - `noto-sans-regular.ttf`, `noto-sans-bold.ttf`: Latin, Greek and Cyrillic, with kerning and ligatures;
 * - `noto-sans-jp-subset.ttf`: only 日本語の文字テスト and a space;
 * - `inter-basic.otf`: printable ASCII with CFF outlines;
 * - `noto-sans-basic.woff2`: printable ASCII, as WOFF2.
 */
export function testFont(
  file:
    | 'noto-sans-regular.ttf'
    | 'noto-sans-bold.ttf'
    | 'noto-sans-jp-subset.ttf'
    | 'inter-basic.otf'
    | 'noto-sans-basic.woff2',
): Uint8Array {
  // Relative to the repository root, where vitest runs; `import.meta.url` is not a file URL under
  // the jsdom environment.
  return new Uint8Array(readFileSync(`projects/core/src/testing/fonts/${file}`));
}
