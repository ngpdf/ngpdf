/** The deepest nesting of elements a document may have; deeper throws. */
export const MAX_NESTING = 64;

/** Cuts long values so an error message stays readable. */
export function show(value: string): string {
  return value.length > 60 ? `${value.slice(0, 60)}...` : value;
}

/** The longest text one node may hold; layout throws past it, and emoji are not searched past it. */
export const MAX_TEXT_LENGTH = 1_048_576;
