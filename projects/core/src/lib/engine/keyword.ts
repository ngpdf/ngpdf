import { show } from './limits';

/** CSS keywords are case-insensitive, so `CENTER` and ` center ` both read as `center`. */
export function keywordOf(value: string): string {
  return value.trim().toLowerCase();
}

/** `a, b or c`, the way an error message lists the keywords a property takes (two or more). */
function listOf(keywords: readonly string[]): string {
  return `${keywords.slice(0, -1).join(', ')} or ${String(keywords.at(-1))}`;
}

/**
 * The keyword `value` names, from the ones `property` takes. Any other value throws, naming the
 * value as written, the property, the element and the keywords: the one rule for every keyword
 * property.
 */
export function oneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  property: string,
  tag: string,
): T {
  const keyword = keywordOf(value);
  const found = allowed.find((candidate) => candidate === keyword);
  return found ?? invalidKeyword(value, property, tag, listOf(allowed));
}

/**
 * The error for a value outside what `property` takes, for a property whose values are not a
 * plain keyword list (keywords mixed with lengths, or several keywords at once): `use` says what
 * it takes, in the words of the message.
 */
export function invalidKeyword(value: string, property: string, tag: string, use: string): never {
  throw new Error(`ngpdf: invalid value "${show(value)}" for ${property} on ${tag}; use ${use}`);
}
