/** The most elements one SVG source may hold; more throws. */
export const MAX_SVG_ELEMENTS = 50_000;

/** The deepest nesting of elements in an SVG source; deeper throws. */
export const MAX_SVG_NESTING = 64;

/** An element of an SVG source. Text and comments are not kept: nothing ngpdf draws reads them. */
export interface XmlElement {
  /** As written, with any namespace prefix (`sodipodi:namedview`). */
  readonly name: string;
  /** Values with their references decoded and their whitespace characters turned into spaces. */
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
  /** Where its start tag begins in the source, for messages. */
  readonly offset: number;
}

interface OpenElement {
  readonly name: string;
  readonly attributes: Map<string, string>;
  readonly children: OpenElement[];
  readonly offset: number;
}

function invalid(reason: string, at: number): never {
  throw new Error(`ngpdf: invalid SVG: ${reason} at ${String(at)}`);
}

const isSpace = (code: number): boolean =>
  code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;

const isNameStart = (code: number): boolean =>
  (code >= 0x61 && code <= 0x7a) ||
  (code >= 0x41 && code <= 0x5a) ||
  code === 0x5f ||
  code === 0x3a ||
  code >= 0x80;

const isNameChar = (code: number): boolean =>
  isNameStart(code) || (code >= 0x30 && code <= 0x39) || code === 0x2d || code === 0x2e;

/** The end of the name starting at `at`; `at` itself when no name starts there. */
function nameEnd(source: string, at: number): number {
  if (at >= source.length || !isNameStart(source.charCodeAt(at))) return at;
  let end = at + 1;
  while (end < source.length && isNameChar(source.charCodeAt(end))) end++;
  return end;
}

function skipSpaces(source: string, at: number): number {
  while (at < source.length && isSpace(source.charCodeAt(at))) at++;
  return at;
}

const PREDEFINED = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['apos', "'"],
  ['quot', '"'],
]);

// Longer than any reference worth reading; looking no further keeps a run of bare `&`s linear.
const MAX_REFERENCE = 32;

/**
 * Decodes the references in `text`, which starts at `base` in the source. A named entity other
 * than the five of XML is dropped with a warning: entities come from a DTD, which is never read.
 */
function decodeReferences(text: string, base: number, warn: (message: string) => void): string {
  let amp = text.indexOf('&');
  if (amp < 0) return text;
  let out = '';
  let from = 0;
  while (amp >= 0) {
    let semi = -1;
    const limit = Math.min(text.length, amp + MAX_REFERENCE);
    for (let at = amp + 1; at < limit; at++) {
      if (text.charCodeAt(at) === 0x3b) {
        semi = at;
        break;
      }
    }
    if (semi < 0) invalid('"&" that starts no reference', base + amp);
    const body = text.slice(amp + 1, semi);
    out += text.slice(from, amp);
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const digits = body.slice(hex ? 2 : 1);
      const valid = digits !== '' && (hex ? /^[\da-f]+$/i : /^\d+$/).test(digits);
      const code = valid ? parseInt(digits, hex ? 16 : 10) : NaN;
      if (!(code >= 1 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) {
        invalid('invalid character reference', base + amp);
      }
      out += String.fromCodePoint(code);
    } else {
      const known = PREDEFINED.get(body);
      if (known !== undefined) out += known;
      else if (body !== '' && nameEnd(body, 0) === body.length) {
        warn(`ngpdf: pdf-svg skipped the entity "&${body};"`);
      } else invalid('"&" that starts no reference', base + amp);
    }
    from = semi + 1;
    amp = text.indexOf('&', from);
  }
  return out + text.slice(from);
}

/** Where a DTD starting at `at` ends, past its `>`; its internal subset and quotes are skipped. */
function dtdEnd(source: string, at: number): number {
  let quote = 0;
  let depth = 0;
  for (let i = at + 9; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (quote !== 0) {
      if (code === quote) quote = 0;
    } else if (code === 0x22 || code === 0x27) quote = code;
    else if (code === 0x5b) depth++;
    else if (code === 0x5d) depth = Math.max(0, depth - 1);
    else if (code === 0x3e && depth === 0) return i + 1;
  }
  return invalid('unclosed DTD', at);
}

/**
 * Parses SVG source as XML, in one pass with no backtracking: every search starts where the last
 * one stopped, so the work is linear in the source. There is no DOMParser, so it runs the same in
 * a browser, a worker and Node. DTDs, entities other than the five of XML and processing
 * instructions are skipped with a warning; malformed markup throws `ngpdf: invalid SVG: …`.
 */
export function parseXml(source: string, warn: (message: string) => void): XmlElement {
  const stack: OpenElement[] = [];
  // One at most; an array, so the start tag reader can set it.
  const roots: OpenElement[] = [];
  let count = 0;
  let at = source.charCodeAt(0) === 0xfeff ? 1 : 0;

  const checkText = (from: number, to: number): void => {
    const text = source.slice(from, to);
    if (stack.length === 0) {
      const first = skipSpaces(source, from);
      if (first < to) invalid('text outside the root element', first);
      return;
    }
    decodeReferences(text, from, warn);
  };

  while (at < source.length) {
    const lt = source.indexOf('<', at);
    checkText(at, lt < 0 ? source.length : lt);
    if (lt < 0) {
      at = source.length;
      break;
    }
    at = lt;
    if (source.startsWith('<!--', at)) {
      const end = source.indexOf('-->', at + 4);
      if (end < 0) invalid('unclosed comment', at);
      at = end + 3;
    } else if (source.startsWith('<![CDATA[', at)) {
      if (stack.length === 0) invalid('CDATA outside the root element', at);
      const end = source.indexOf(']]>', at + 9);
      if (end < 0) invalid('unclosed CDATA section', at);
      at = end + 3;
    } else if (source.startsWith('<!DOCTYPE', at)) {
      if (roots.length > 0) invalid('a DTD after the root element', at);
      at = dtdEnd(source, at);
      warn('ngpdf: pdf-svg skipped a DTD');
    } else if (source.startsWith('<!', at)) {
      invalid('unknown markup declaration', at);
    } else if (source.startsWith('<?', at)) {
      const end = source.indexOf('?>', at + 2);
      if (end < 0) invalid('unclosed processing instruction', at);
      const target = source.slice(at + 2, nameEnd(source, at + 2));
      if (target.toLowerCase() !== 'xml') {
        warn(`ngpdf: pdf-svg skipped the processing instruction "${target}"`);
      }
      at = end + 2;
    } else if (source.startsWith('</', at)) {
      const end = nameEnd(source, at + 2);
      const name = source.slice(at + 2, end);
      const close = skipSpaces(source, end);
      if (close >= source.length) invalid('unclosed end tag', close);
      if (source.charCodeAt(close) !== 0x3e || name === '') invalid('malformed end tag', at);
      const open = stack.pop();
      if (!open) invalid('end tag with no element to close', at);
      if (open.name !== name) invalid(`</${name}> does not close <${open.name}>`, at);
      at = close + 1;
    } else {
      at = startTag(at);
    }
  }
  const unclosed = stack.at(-1);
  if (unclosed) invalid(`unclosed <${unclosed.name}>`, source.length);
  return roots[0] ?? invalid('no root element', at);

  /** Reads the start tag at `lt` and returns where the source goes on. */
  function startTag(lt: number): number {
    const end = nameEnd(source, lt + 1);
    if (end === lt + 1) invalid('invalid name', lt + 1);
    if (stack.length === 0 && roots.length > 0) invalid('a second root element', lt);
    if (++count > MAX_SVG_ELEMENTS) {
      throw new Error(`ngpdf: pdf-svg has more than ${String(MAX_SVG_ELEMENTS)} elements`);
    }
    if (stack.length >= MAX_SVG_NESTING) {
      throw new Error(`ngpdf: pdf-svg nesting deeper than ${String(MAX_SVG_NESTING)}`);
    }
    const element: OpenElement = {
      name: source.slice(lt + 1, end),
      attributes: new Map(),
      children: [],
      offset: lt,
    };
    const parent = stack.at(-1);
    if (parent) parent.children.push(element);
    else roots.push(element);
    let at = end;
    for (;;) {
      const next = skipSpaces(source, at);
      if (next >= source.length) invalid('unclosed tag', next);
      const code = source.charCodeAt(next);
      if (code === 0x3e) {
        stack.push(element);
        return next + 1;
      }
      if (code === 0x2f) {
        if (source.charCodeAt(next + 1) !== 0x3e) invalid('"/" not followed by ">"', next);
        return next + 2;
      }
      if (code === 0x3c) invalid('unexpected "<" in a tag', next);
      if (next === at) invalid('no space between attributes', next);
      const nameStop = nameEnd(source, next);
      if (nameStop === next) invalid('invalid name', next);
      const name = source.slice(next, nameStop);
      let eq = skipSpaces(source, nameStop);
      if (source.charCodeAt(eq) !== 0x3d) invalid(`attribute "${name}" has no value`, eq);
      eq = skipSpaces(source, eq + 1);
      const quote = source.charCodeAt(eq);
      if (quote !== 0x22 && quote !== 0x27) invalid('unquoted attribute value', eq);
      const close = source.indexOf(quote === 0x22 ? '"' : "'", eq + 1);
      if (close < 0) invalid('unclosed attribute value', eq);
      const raw = source.slice(eq + 1, close);
      const angle = raw.indexOf('<');
      if (angle >= 0) invalid('"<" in an attribute value', eq + 1 + angle);
      if (element.attributes.has(name)) invalid(`duplicate attribute "${name}"`, next);
      // Whitespace is normalized before references are decoded, so `&#10;` stays a line feed.
      const value = decodeReferences(raw.replace(/[\t\n\r]/g, ' '), eq + 1, warn);
      element.attributes.set(name, value);
      at = close + 1;
    }
  }
}
