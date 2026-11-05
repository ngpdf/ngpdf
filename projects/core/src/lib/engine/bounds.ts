/**
 * The largest number, either sign, a draw op may hold. pdfkit throws `unsupported number` on any
 * number it writes past ±1e21, and writes the products of transforms for gradients, so this
 * leaves room for one product of two such numbers. A billion points is about 350 km: past any
 * page, but not past the coordinates of a large drawing scaled down onto one.
 */
export const MAX_DRAW_NUMBER = 1e9;

/** How errors say `MAX_DRAW_NUMBER`. */
export const DRAW_NUMBER_LIMIT = '±1e9';

/**
 * The first number in `value`, at any depth of its arrays and objects, past `MAX_DRAW_NUMBER`
 * (NaN and the infinities too); undefined when there is none. Strings and byte arrays hold none.
 */
export function unwritable(value: unknown): number | undefined {
  if (typeof value === 'number') return Math.abs(value) <= MAX_DRAW_NUMBER ? undefined : value;
  if (typeof value !== 'object' || value === null || ArrayBuffer.isView(value)) return undefined;
  for (const item of Object.values(value)) {
    const found = unwritable(item);
    if (found !== undefined) return found;
  }
  return undefined;
}
