import { createNode, propsOf, type PdfNode } from '../tree/node';
import { parseColor, type Color } from './color';

export type { Color };

export type Length = number | { readonly percent: number } | 'auto';

export interface Edges<T> {
  readonly top: T;
  readonly right: T;
  readonly bottom: T;
  readonly left: T;
}

export interface TextStyle {
  readonly color: Color;
  /** The CSS `font-family` list as written; `fonts.ts` turns it into fonts. */
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: 'normal' | 'bold';
  readonly fontStyle: 'normal' | 'italic';
  /** Multiplier of the font size. */
  readonly lineHeight: number;
  readonly textAlign: 'left' | 'center' | 'right';
  readonly textDecoration: 'none' | 'underline' | 'line-through';
}

type AlignItems = 'stretch' | 'flex-start' | 'center' | 'flex-end';

export interface ResolvedStyle extends TextStyle {
  readonly flexDirection: 'row' | 'column';
  readonly flexGrow: number;
  readonly flexShrink: number;
  readonly flexBasis: Length;
  readonly justifyContent:
    'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  readonly alignItems: AlignItems;
  readonly alignSelf: 'auto' | AlignItems;
  readonly gap: number;
  readonly width: Length;
  readonly height: Length;
  readonly minWidth: Length;
  readonly minHeight: Length;
  readonly maxWidth: Length;
  readonly maxHeight: Length;
  readonly margin: Edges<Length>;
  readonly padding: Edges<Length>;
  readonly borderWidth: Edges<number>;
  readonly borderColor: Edges<Color>;
  readonly borderRadius: number;
  /** Null when nothing is painted, also for a fully transparent color. */
  readonly backgroundColor: Color | null;
  readonly opacity: number;
  readonly objectFit: 'contain' | 'cover';
  readonly breakBefore: boolean;
}

export interface FlexParts {
  readonly grow: number;
  readonly shrink: number;
  readonly basis: Length;
}

export interface BorderParts {
  readonly width: number;
  readonly color: Color;
  /** A CSS border style other than solid or none; it is drawn solid. */
  readonly unsupportedStyle: string | null;
}

export const MAX_NESTING = 64;

const BLACK: Color = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });

export const ROOT_TEXT_STYLE: TextStyle = Object.freeze({
  color: BLACK,
  fontFamily: 'Helvetica',
  fontSize: 10,
  fontWeight: 'normal',
  fontStyle: 'normal',
  lineHeight: 1.2,
  textAlign: 'left',
  textDecoration: 'none',
});

const POINTS_PER_INCH = 72;
const UNIT_FACTORS = new Map<string, number>([
  ['', 1],
  ['pt', 1],
  ['px', 1],
  ['in', POINTS_PER_INCH],
  ['cm', POINTS_PER_INCH / 2.54],
  ['mm', POINTS_PER_INCH / 25.4],
]);

const BORDER_STYLES = new Set([
  'none',
  'hidden',
  'solid',
  'dashed',
  'dotted',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
]);

function fail(message: string, tag?: string): never {
  throw new Error(`ngpdf: ${message}${tag ? ` on ${tag}` : ''}`);
}

/** Cuts long values so an error message stays readable. */
function show(value: string): string {
  return value.length > 60 ? `${value.slice(0, 60)}...` : value;
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isSpace(code: number): boolean {
  return code === 32 || (code >= 9 && code <= 13);
}

/** End index of a decimal number at the start of `text`; 0 when there is none. */
function scanNumber(text: string): number {
  let i = 0;
  const first = text.charCodeAt(0);
  if (first === 43 || first === 45) i++;
  let digits = 0;
  while (isDigit(text.charCodeAt(i))) {
    i++;
    digits++;
  }
  if (text.charCodeAt(i) === 46) {
    i++;
    while (isDigit(text.charCodeAt(i))) {
      i++;
      digits++;
    }
  }
  return digits === 0 ? 0 : i;
}

/** A unitless number, or null when the whole token is not one. */
function parseNumber(token: string): number | null {
  const end = scanNumber(token);
  if (end === 0 || end !== token.length) return null;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

/** Splits on whitespace outside parentheses, so `rgb(1, 2, 3)` stays one token. */
function tokenize(value: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 40) depth++;
    else if (code === 41 && depth > 0) depth--;
    if (isSpace(code) && depth === 0) {
      if (start >= 0) tokens.push(value.slice(start, i));
      start = -1;
    } else if (start < 0) {
      start = i;
    }
  }
  if (start >= 0) tokens.push(value.slice(start));
  return tokens;
}

export function parseLength(value: string, tag?: string): Length {
  const text = value.trim();
  if (text === 'auto') return 'auto';
  const end = scanNumber(text);
  if (end === 0) return fail(`invalid length "${show(value)}"`, tag);
  const amount = Number(text.slice(0, end));
  if (!Number.isFinite(amount)) return fail(`invalid length "${show(value)}"`, tag);
  const unit = text.slice(end).toLowerCase();
  if (unit === '%') return { percent: amount };
  const factor = UNIT_FACTORS.get(unit);
  if (factor === undefined) return fail(`unknown unit in "${show(value)}"`, tag);
  return amount * factor;
}

/** A length that must resolve to points (no percent, no auto). */
function parsePoints(value: string, tag?: string): number {
  const length = parseLength(value, tag);
  if (typeof length !== 'number') return fail(`expected a length in "${show(value)}"`, tag);
  return length;
}

/** Font sizes and padding can't go below 0 in CSS; margins can. */
function rejectNegative<T extends Length>(length: T, value: string, tag?: string): T {
  const amount = typeof length === 'object' ? length.percent : length;
  if (typeof amount === 'number' && amount < 0) {
    return fail(`expected a non-negative length in "${show(value)}"`, tag);
  }
  return length;
}

/** Padding takes a length or a percentage: CSS has no `auto` or negative padding. */
function parsePadding(value: string, tag?: string): Length {
  const length = parseLength(value, tag);
  if (length === 'auto') return fail(`expected a length in "${show(value)}"`, tag);
  return rejectNegative(length, value, tag);
}

function parseEdgeValues<T>(value: string, parse: (token: string) => T, tag?: string): Edges<T> {
  const tokens = tokenize(value);
  if (tokens.length < 1 || tokens.length > 4) {
    return fail(`expected 1 to 4 values in "${show(value)}"`, tag);
  }
  const [a, b = a, c = a, d = b] = tokens.map(parse);
  return { top: a as T, right: b as T, bottom: c as T, left: d as T };
}

/** The `margin` shorthand: 1 to 4 values. */
export function parseEdges(value: string, tag?: string): Edges<Length> {
  return parseEdgeValues(value, (token) => parseLength(token, tag), tag);
}

/** `<width> <style> <color>` in any order; every part is optional. */
export function parseBorder(value: string, tag?: string): BorderParts {
  let width: number | null = null;
  let color: Color | null = null;
  let none = false;
  let unsupportedStyle: string | null = null;
  const tokens = tokenize(value);
  if (tokens.length > 3) return fail(`too many values in "${show(value)}"`, tag);
  for (const token of tokens) {
    const code = token.charCodeAt(0);
    if (isDigit(code) || code === 46 || code === 43 || code === 45) {
      width = parsePoints(token, tag);
    } else if (BORDER_STYLES.has(token)) {
      if (token === 'none' || token === 'hidden') none = true;
      else if (token !== 'solid') unsupportedStyle = token;
    } else {
      color = parseColor(token, tag);
    }
  }
  return { width: none ? 0 : (width ?? 1), color: color ?? BLACK, unsupportedStyle };
}

/** `flex: <grow> [<shrink>] [<basis>]`, plus the `auto` and `none` keywords. */
export function parseFlex(value: string, tag?: string): FlexParts {
  const tokens = tokenize(value);
  const [first, second, third] = tokens;
  if (first === undefined || tokens.length > 3) {
    return fail(`expected 1 to 3 values in "${show(value)}"`, tag);
  }
  if (tokens.length === 1) {
    if (first === 'auto') return { grow: 1, shrink: 1, basis: 'auto' };
    if (first === 'none') return { grow: 0, shrink: 0, basis: 'auto' };
    const grow = parseNumber(first);
    if (grow !== null) return { grow, shrink: 1, basis: 0 };
    return { grow: 1, shrink: 1, basis: parseLength(first, tag) };
  }
  const grow = parseNumber(first);
  if (grow === null) return fail(`invalid flex-grow in "${show(value)}"`, tag);
  const shrink = parseNumber(second ?? '');
  if (tokens.length === 2) {
    if (shrink !== null) return { grow, shrink, basis: 0 };
    return { grow, shrink: 1, basis: parseLength(second ?? '', tag) };
  }
  if (shrink === null) return fail(`invalid flex-shrink in "${show(value)}"`, tag);
  return { grow, shrink, basis: parseLength(third ?? '', tag) };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Side = 'top' | 'right' | 'bottom' | 'left';

function withSide<T>(edges: Edges<T>, side: Side, value: T): Edges<T> {
  return { ...edges, [side]: value };
}

function allSides<T>(value: T): Edges<T> {
  return { top: value, right: value, bottom: value, left: value };
}

function oneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  property: string,
  tag: string,
): T {
  const found = allowed.find((candidate) => candidate === value);
  if (found === undefined) return fail(`invalid value "${show(value)}" for ${property}`, tag);
  return found;
}

function fontWeightOf(value: string): TextStyle['fontWeight'] {
  if (value === 'bold' || value === 'bolder') return 'bold';
  const weight = parseNumber(value);
  return weight !== null && weight >= 600 ? 'bold' : 'normal';
}

const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

function defaultStyle(node: PdfNode, inherited: TextStyle): Mutable<ResolvedStyle> {
  return {
    ...inherited,
    flexDirection: node.tag === 'pdf-row' ? 'row' : 'column',
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    alignSelf: 'auto',
    gap: 0,
    width: 'auto',
    height: 'auto',
    minWidth: 'auto',
    minHeight: 'auto',
    maxWidth: 'auto',
    maxHeight: 'auto',
    margin: allSides(0),
    padding: allSides(0),
    borderWidth: allSides(0),
    borderColor: allSides(BLACK),
    borderRadius: 0,
    backgroundColor: null,
    opacity: 1,
    objectFit: 'contain',
    breakBefore: propsOf(node)['breakBefore'] === true,
  };
}

type Warn = (message: string) => void;

/** Applies one declaration; a property this engine does not know is ignored. */
function apply(
  style: Mutable<ResolvedStyle>,
  property: string,
  value: string,
  tag: string,
  warn: Warn,
): void {
  const side = SIDES.find((s) => property.includes(`-${s}`));
  if (side && property.startsWith('margin-')) {
    style.margin = withSide(style.margin, side, parseLength(value, tag));
    return;
  }
  if (side && property.startsWith('padding-')) {
    style.padding = withSide(style.padding, side, parsePadding(value, tag));
    return;
  }
  if (side && property === `border-${side}`) {
    const border = parseBorder(value, tag);
    warnBorder(border, warn);
    style.borderWidth = withSide(style.borderWidth, side, border.width);
    style.borderColor = withSide(style.borderColor, side, border.color);
    return;
  }
  if (side && property === `border-${side}-width`) {
    style.borderWidth = withSide(style.borderWidth, side, parsePoints(value, tag));
    return;
  }
  if (side && property === `border-${side}-color`) {
    style.borderColor = withSide(style.borderColor, side, parseColor(value, tag));
    return;
  }
  switch (property) {
    case 'color':
      style.color = parseColor(value, tag);
      break;
    case 'font-family':
      style.fontFamily = value.trim();
      break;
    case 'font-size':
      style.fontSize = rejectNegative(parsePoints(value, tag), value, tag);
      break;
    case 'font-weight':
      style.fontWeight = fontWeightOf(value);
      break;
    case 'font-style':
      style.fontStyle = value === 'italic' || value === 'oblique' ? 'italic' : 'normal';
      break;
    case 'text-align':
      style.textAlign = oneOf(value, ['left', 'center', 'right'], property, tag);
      break;
    case 'text-decoration':
      style.textDecoration = oneOf(value, ['none', 'underline', 'line-through'], property, tag);
      break;
    case 'flex-direction':
      style.flexDirection = oneOf(value, ['row', 'column'], property, tag);
      break;
    case 'flex': {
      const flex = parseFlex(value, tag);
      style.flexGrow = flex.grow;
      style.flexShrink = flex.shrink;
      style.flexBasis = flex.basis;
      break;
    }
    case 'flex-grow':
      style.flexGrow = numberOf(value, property, tag);
      break;
    case 'flex-shrink':
      style.flexShrink = numberOf(value, property, tag);
      break;
    case 'flex-basis':
      style.flexBasis = parseLength(value, tag);
      break;
    case 'justify-content':
      style.justifyContent = oneOf(
        value,
        ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
        property,
        tag,
      );
      break;
    case 'align-items':
      style.alignItems = oneOf(
        value,
        ['stretch', 'flex-start', 'center', 'flex-end'],
        property,
        tag,
      );
      break;
    case 'align-self':
      style.alignSelf = oneOf(
        value,
        ['auto', 'stretch', 'flex-start', 'center', 'flex-end'],
        property,
        tag,
      );
      break;
    case 'gap':
      style.gap = parsePoints(value, tag);
      break;
    case 'width':
      style.width = parseLength(value, tag);
      break;
    case 'height':
      style.height = parseLength(value, tag);
      break;
    case 'min-width':
      style.minWidth = parseLength(value, tag);
      break;
    case 'min-height':
      style.minHeight = parseLength(value, tag);
      break;
    case 'max-width':
      style.maxWidth = parseLength(value, tag);
      break;
    case 'max-height':
      style.maxHeight = parseLength(value, tag);
      break;
    case 'margin':
      style.margin = parseEdges(value, tag);
      break;
    case 'padding':
      style.padding = parseEdgeValues(value, (token) => parsePadding(token, tag), tag);
      break;
    case 'border': {
      const border = parseBorder(value, tag);
      warnBorder(border, warn);
      style.borderWidth = allSides(border.width);
      style.borderColor = allSides(border.color);
      break;
    }
    case 'border-width':
      style.borderWidth = parseEdgeValues(value, (token) => parsePoints(token, tag), tag);
      break;
    case 'border-color':
      style.borderColor = parseEdgeValues(value, (token) => parseColor(token, tag), tag);
      break;
    case 'border-radius':
      style.borderRadius = parsePoints(value, tag);
      break;
    case 'background-color': {
      const color = parseColor(value, tag);
      style.backgroundColor = color.a > 0 ? color : null;
      break;
    }
    case 'opacity':
      style.opacity = Math.min(1, Math.max(0, numberOf(value, property, tag)));
      break;
    case 'object-fit':
      style.objectFit = oneOf(value, ['contain', 'cover'], property, tag);
      break;
    case 'break-before':
      style.breakBefore = style.breakBefore || value === 'page';
      break;
    default:
      break;
  }
}

function numberOf(value: string, property: string, tag: string): number {
  const number = parseNumber(value.trim());
  if (number === null) return fail(`invalid value "${show(value)}" for ${property}`, tag);
  return number;
}

function warnBorder(border: BorderParts, warn: Warn): void {
  if (border.unsupportedStyle !== null) {
    warn(`ngpdf: border style "${border.unsupportedStyle}" is not supported; drawing solid`);
  }
}

/** A bare number is a multiplier, N% is N/100, a length is divided by the font size. */
function lineHeightOf(value: string, fontSize: number, tag: string): number {
  const bare = parseNumber(value);
  if (bare !== null) return bare;
  const length = parseLength(value, tag);
  if (length === 'auto') return fail(`invalid line-height "${show(value)}"`, tag);
  if (typeof length !== 'number') return length.percent / 100;
  return fontSize > 0 ? length / fontSize : ROOT_TEXT_STYLE.lineHeight;
}

function resolveOne(node: PdfNode, inherited: TextStyle, warn: Warn): ResolvedStyle {
  const style = defaultStyle(node, inherited);
  let lineHeight: string | null = null;
  for (const [property, value] of Object.entries(node.rawStyle)) {
    if (property === 'line-height') lineHeight = value.trim();
    else apply(style, property, value, node.tag, warn);
  }
  // Resolved last because a length depends on this element's own font size.
  if (lineHeight !== null && lineHeight !== 'normal') {
    style.lineHeight = lineHeightOf(lineHeight, style.fontSize, node.tag);
  }
  return style;
}

function textPartOf(style: ResolvedStyle): TextStyle {
  return {
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    lineHeight: style.lineHeight,
    textAlign: style.textAlign,
    textDecoration: style.textDecoration,
  };
}

/**
 * The style of an anonymous text box (bare text inside an element other than pdf-text): the
 * parent's text styles and the defaults for everything else, as CSS gives an anonymous block.
 */
export function anonymousTextStyle(parent: ResolvedStyle): ResolvedStyle {
  return defaultStyle(createNode('element', 'pdf-text'), textPartOf(parent));
}

interface Pending {
  readonly node: PdfNode;
  readonly depth: number;
  readonly inherited: TextStyle;
}

/**
 * A `pdf-image` is measured by Yoga, and a measured node cannot have children: without this check
 * Yoga fails deep in layout with an unclear error. Its text is ignored, so only elements count.
 */
function checkImageChildren(node: PdfNode): void {
  if (node.tag !== 'pdf-image') return;
  const child = node.children.find((candidate) => candidate.kind === 'element');
  if (child) fail(`pdf-image cannot have children (found <${child.tag}>)`);
}

/**
 * Resolves every element under `root`; text and comment nodes get no entry. Warnings (a border
 * style drawn solid) go to `warn`, which the caller dedupes and prints in dev mode only. Runs
 * before images load, so a `pdf-image` with element children throws before anything is fetched.
 */
export function resolveStyles(
  root: PdfNode,
  warn: Warn = () => undefined,
): Map<PdfNode, ResolvedStyle> {
  const result = new Map<PdfNode, ResolvedStyle>();
  if (root.kind !== 'element') return result;
  const stack: Pending[] = [{ node: root, depth: 1, inherited: ROOT_TEXT_STYLE }];
  for (let item = stack.pop(); item; item = stack.pop()) {
    if (item.depth > MAX_NESTING) fail(`nesting deeper than ${String(MAX_NESTING)}`);
    checkImageChildren(item.node);
    const style = resolveOne(item.node, item.inherited, warn);
    result.set(item.node, style);
    const inherited = textPartOf(style);
    for (let i = item.node.children.length - 1; i >= 0; i--) {
      const child = item.node.children[i];
      if (child?.kind === 'element') stack.push({ node: child, depth: item.depth + 1, inherited });
    }
  }
  return result;
}
