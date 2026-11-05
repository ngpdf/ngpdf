import { toHex, type Color } from '../color';
import { show } from '../limits';
import type { Corners } from '../style';
import type { DrawOp, GradientFill, Matrix, PathSegment } from '../writer';
import {
  gradientPaint,
  hrefOf,
  resolveGradient,
  type GradientColorStop,
  type ResolvedGradient,
} from './gradient';
import {
  computeStyle,
  initialStyle,
  parseLength,
  type Paint,
  type SvgStyle,
  type Viewport,
} from './presentation';
import { boundsOf, shapeSegments, type Bounds } from './shapes';
import { IDENTITY, isIdentity, multiply, parseTransform } from './transform';
import {
  DEFAULT_ASPECT,
  parseAspectRatio,
  parseViewBox,
  viewBoxMatrix,
  type AspectRatio,
  type ViewBox,
} from './viewport';
import { MAX_SVG_ELEMENTS, type XmlElement } from './xml';

/** How deep `use` elements may point at elements holding more `use` elements. */
export const MAX_USE_DEPTH = 16;

/**
 * The most work one SVG may cost to draw: path segments, gradient stops, dash lengths and half
 * of the attribute text, for every element visited. A 1 MB path has about 250,000 segments; `use`,
 * and shapes sharing a gradient or a dash pattern, repeat them, and this bounds what the copies
 * cost.
 */
export const MAX_SVG_SEGMENTS = 1_000_000;

/** A parsed SVG, ready for the display list to place in a box. */
export interface SvgAsset {
  /** The natural size in points: the root's `width` and `height`, or its viewBox's. */
  readonly width: number;
  readonly height: number;
  /** The root's viewBox, or one as large as its natural size. */
  readonly viewBox: ViewBox;
  readonly aspect: AspectRatio;
  /** The drawing, in the root's user space (viewBox coordinates). */
  readonly ops: readonly DrawOp[];
}

/** A fill or stroke of a shape op, without its line settings. */
interface ShapePaint {
  readonly color: string;
  readonly opacity: number;
  readonly gradient?: GradientFill;
}

const NOT_ROUNDED: Corners<number> = { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };

/** Shapes whose outline reads no length, so the viewport never changes it. */
const UNSIZED = new Set(['polyline', 'polygon']);

/** Drawn, each in its own way below. */
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const CONTAINERS = new Set(['svg', 'g', 'use']);

/** Never drawn on their own, and nothing to warn about: they hold no picture or are read by reference. */
const SILENT = new Set([
  'defs',
  'title',
  'desc',
  'metadata',
  'linearGradient',
  'radialGradient',
  'stop',
]);

// The size a browser gives an SVG that says nothing of it.
const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 150;

const finite = (values: readonly number[]): boolean => values.every(Number.isFinite);

function segmentsFinite(segments: readonly PathSegment[]): boolean {
  return segments.every((segment) => {
    switch (segment.kind) {
      case 'close':
        return true;
      case 'curve':
        return finite([
          segment.c1.x,
          segment.c1.y,
          segment.c2.x,
          segment.c2.y,
          segment.to.x,
          segment.to.y,
        ]);
      default:
        return finite([segment.to.x, segment.to.y]);
    }
  });
}

/** A length of the root's `width` or `height` in points; null for a percentage or none. */
function rootLength(text: string | undefined): number | null {
  if (text === undefined || text.trim().endsWith('%')) return null;
  const value = parseLength(text, 0);
  return value !== null && value > 0 ? value : null;
}

/** Wraps `content` in the transform, clip and group asked for, innermost last. */
function wrap(
  content: DrawOp[],
  matrix: Matrix,
  opacity: number,
  clip: { readonly w: number; readonly h: number } | null,
  inner: Matrix,
): DrawOp[] {
  if (content.length === 0) return content;
  let ops = content;
  if (!isIdentity(inner)) ops = [{ op: 'transform', matrix: inner }, ...ops, { op: 'untransform' }];
  if (clip) {
    ops = [
      { op: 'clip', x: 0, y: 0, w: clip.w, h: clip.h, radii: NOT_ROUNDED },
      ...ops,
      { op: 'unclip' },
    ];
  }
  if (opacity < 1) ops = [{ op: 'group', opacity }, ...ops, { op: 'ungroup' }];
  if (!isIdentity(matrix)) ops = [{ op: 'transform', matrix }, ...ops, { op: 'untransform' }];
  return ops;
}

/**
 * Turns a parsed SVG into draw ops in its root's user space. `color` is the pdf-svg's own color,
 * what `currentColor` means at the root. Elements and features ngpdf does not draw are left out
 * with one warning each, and the rest is drawn. A `use` may point only at an `#id` of the same
 * file; past 16 levels of `use` or 50,000 elements drawn through them, it throws.
 */
export function compileSvg(
  root: XmlElement,
  color: Color,
  warn: (message: string) => void,
): SvgAsset {
  if (root.name !== 'svg') {
    throw new Error(
      `ngpdf: invalid SVG: the root element is <${root.name}>, not <svg> at ${String(root.offset)}`,
    );
  }
  const ids = new Map<string, XmlElement>();
  const index = (element: XmlElement): void => {
    const id = element.attributes.get('id');
    if (id !== undefined && !ids.has(id)) ids.set(id, element);
    for (const name of element.attributes.keys()) {
      if (name.toLowerCase().startsWith('on')) {
        warn(`ngpdf: pdf-svg skipped the event attribute "${show(name)}"`);
      }
    }
    if (element.name === 'script') warn('ngpdf: pdf-svg skipped <script>');
    else if (element.name === 'style') warn('ngpdf: pdf-svg does not draw <style> sheets');
    // A script's or style sheet's children are text, which is never kept.
    else element.children.forEach(index);
  };
  index(root);

  const parsedBox = parseViewBox(root.attributes.get('viewBox'));
  if (parsedBox === null && root.attributes.has('viewBox')) {
    warn(
      `ngpdf: pdf-svg ignored the invalid value "${show(root.attributes.get('viewBox') ?? '')}" for viewBox`,
    );
  }
  const box = parsedBox === 'empty' ? null : parsedBox;
  const ratio = box ? box.height / box.width : null;
  const givenWidth = rootLength(root.attributes.get('width'));
  const givenHeight = rootLength(root.attributes.get('height'));
  let width: number;
  let height: number;
  if (givenWidth !== null) {
    width = givenWidth;
    height = givenHeight ?? (ratio ? givenWidth * ratio : DEFAULT_HEIGHT);
  } else if (givenHeight !== null) {
    height = givenHeight;
    width = ratio ? givenHeight / ratio : DEFAULT_WIDTH;
  } else {
    width = box?.width ?? DEFAULT_WIDTH;
    height = box?.height ?? DEFAULT_HEIGHT;
  }
  const viewBox = box ?? { x: 0, y: 0, width, height };
  let aspect = parseAspectRatio(root.attributes.get('preserveAspectRatio'));
  if (!aspect) {
    warn(
      `ngpdf: pdf-svg ignored the invalid value "${show(root.attributes.get('preserveAspectRatio') ?? '')}" for preserveAspectRatio`,
    );
    aspect = DEFAULT_ASPECT;
  }
  const asset = { width, height, viewBox, aspect };
  if (parsedBox === 'empty') return { ...asset, ops: [] };

  let drawn = 0;
  let segmentCount = 0;
  const spend = (count: number): void => {
    segmentCount += count;
    if (segmentCount > MAX_SVG_SEGMENTS) {
      throw new Error(
        `ngpdf: pdf-svg drawing is over its budget of ${String(MAX_SVG_SEGMENTS)} path segments, gradient stops, dashes and attributes`,
      );
    }
  };
  const gradients = new Map<XmlElement, ResolvedGradient>();
  const gradientStops = new Map<XmlElement, readonly GradientColorStop[]>();
  // A shape drawn again through `use` is parsed once, or once per viewport size when it has lengths.
  const outlines = new Map<
    XmlElement,
    { viewport: Viewport; segments: readonly PathSegment[] | null }
  >();

  const paintOf = (
    paint: Paint,
    opacity: number,
    style: SvgStyle,
    bounds: () => Bounds,
    viewport: Viewport,
  ): ShapePaint | null => {
    const solid = (ink: Color, times = opacity): ShapePaint | null => {
      const alpha = ink.a * times;
      return alpha > 0 ? { color: toHex(ink), opacity: alpha } : null;
    };
    switch (paint.kind) {
      case 'none':
        return null;
      case 'color':
        return solid(paint.color);
      case 'current':
        return solid(style.color);
      default: {
        const target = ids.get(paint.id);
        if (!target || (target.name !== 'linearGradient' && target.name !== 'radialGradient')) {
          return paint.fallback ? paintOf(paint.fallback, opacity, style, bounds, viewport) : null;
        }
        let resolved = gradients.get(target);
        if (!resolved) {
          resolved = resolveGradient(target, ids, color, warn, gradientStops);
          gradients.set(target, resolved);
        }
        const result = gradientPaint(resolved, bounds(), viewport, opacity);
        if (result.kind === 'none') return null;
        // Its alpha has the opacity in it already.
        if (result.kind === 'solid') return solid(result.color, 1);
        spend(result.gradient.stops.length);
        const first = result.gradient.stops[0];
        return { color: first?.color ?? '#000000', opacity: 1, gradient: result.gradient };
      }
    }
  };
  const shape = (element: XmlElement, style: SvgStyle, viewport: Viewport): DrawOp[] => {
    if (!style.visible) return [];
    let outline = outlines.get(element);
    // Path data and points take no percentages, so they are parsed once whatever the viewport.
    const fixed = element.name === 'path' || UNSIZED.has(element.name);
    const stale =
      outline?.viewport.width !== viewport.width || outline.viewport.height !== viewport.height;
    if (!outline || (stale && !fixed)) {
      const parsed = shapeSegments(element, viewport);
      outline = { viewport, segments: parsed && segmentsFinite(parsed) ? parsed : null };
      outlines.set(element, outline);
    }
    const { segments } = outline;
    if (!segments) return [];
    spend(segments.length);
    let cached: Bounds | null = null;
    const bounds = (): Bounds => (cached ??= boundsOf(segments));
    const fill =
      element.name === 'line'
        ? null
        : paintOf(style.fill, style.fillOpacity, style, bounds, viewport);
    const stroke =
      style.strokeWidth > 0
        ? paintOf(style.stroke, style.strokeOpacity, style, bounds, viewport)
        : null;
    if (!fill && !stroke) return [];
    // The writer writes the dash pattern again for each stroked shape.
    if (stroke && style.dashArray) spend(style.dashArray.length);
    return [
      {
        op: 'shape',
        segments,
        ...(fill && { fill: { ...fill, rule: style.fillRule } }),
        ...(stroke && {
          stroke: {
            ...stroke,
            width: style.strokeWidth,
            cap: style.lineCap,
            join: style.lineJoin,
            miterLimit: style.miterLimit,
            ...(style.dashArray && { dash: { pattern: style.dashArray, phase: style.dashOffset } }),
          },
        }),
      },
    ];
  };

  const children = (
    element: XmlElement,
    style: SvgStyle,
    viewport: Viewport,
    depth: number,
  ): DrawOp[] => element.children.flatMap((child) => visit(child, style, viewport, depth));

  const visit = (
    element: XmlElement,
    parent: SvgStyle,
    viewport: Viewport,
    depth: number,
  ): DrawOp[] => {
    const { name } = element;
    if (SILENT.has(name) || name.includes(':') || name === 'script' || name === 'style') return [];
    if (!SHAPES.has(name) && !CONTAINERS.has(name)) {
      warn(`ngpdf: pdf-svg does not draw <${name}>`);
      return [];
    }
    if (++drawn > MAX_SVG_ELEMENTS) {
      throw new Error(
        `ngpdf: pdf-svg use expands to more than ${String(MAX_SVG_ELEMENTS)} elements`,
      );
    }
    // Its attributes are parsed again on every visit, a `use` copy included, so each visit pays
    // for their length. Path data and points are parsed once (see `outlines`).
    let attributeLength = 0;
    for (const [name, value] of element.attributes) {
      if (name !== 'd' && name !== 'points') attributeLength += value.length;
    }
    spend(Math.ceil(attributeLength / 2));
    const style = computeStyle(element, parent, viewport, warn);
    if (!style.display || style.opacity <= 0) return [];
    let matrix: Matrix = IDENTITY;
    if (style.transform !== null) {
      const parsed = parseTransform(style.transform);
      if (parsed) matrix = parsed;
      else
        warn(`ngpdf: pdf-svg ignored the invalid value "${show(style.transform)}" for transform`);
    }
    const length = (attribute: string, reference: number, fallback: number): number =>
      parseLength(element.attributes.get(attribute) ?? '', reference) ?? fallback;
    let content: DrawOp[];
    let clip: { w: number; h: number } | null = null;
    let inner: Matrix = IDENTITY;
    switch (name) {
      case 'g':
        content = children(element, style, viewport, depth);
        break;
      case 'use': {
        const href = hrefOf(element);
        if (href === undefined) return [];
        if (!href.startsWith('#')) {
          warn(`ngpdf: pdf-svg skipped the external reference "${show(href)}"`);
          return [];
        }
        const target = ids.get(href.slice(1));
        if (!target) {
          warn(`ngpdf: pdf-svg use points at "${show(href)}", which is not in the file`);
          return [];
        }
        if (depth >= MAX_USE_DEPTH) {
          throw new Error(`ngpdf: pdf-svg use nested deeper than ${String(MAX_USE_DEPTH)}`);
        }
        matrix = multiply(matrix, [
          1,
          0,
          0,
          1,
          length('x', viewport.width, 0),
          length('y', viewport.height, 0),
        ]);
        content = visit(target, style, viewport, depth + 1);
        break;
      }
      case 'svg': {
        const w = length('width', viewport.width, viewport.width);
        const h = length('height', viewport.height, viewport.height);
        if (!(w > 0 && h > 0)) return [];
        matrix = multiply(matrix, [
          1,
          0,
          0,
          1,
          length('x', viewport.width, 0),
          length('y', viewport.height, 0),
        ]);
        clip = { w, h };
        const nested = parseViewBox(element.attributes.get('viewBox'));
        if (nested === 'empty') return [];
        let own: Viewport;
        if (nested) {
          inner = viewBoxMatrix(
            nested,
            parseAspectRatio(element.attributes.get('preserveAspectRatio')) ?? DEFAULT_ASPECT,
            w,
            h,
          );
          own = { width: nested.width, height: nested.height };
        } else {
          own = { width: w, height: h };
        }
        content = children(element, style, own, depth);
        break;
      }
      default:
        content = shape(element, style, viewport);
    }
    if (!finite(matrix) || !finite(inner)) return [];
    return wrap(content, matrix, style.opacity, clip, inner);
  };

  const viewport = { width: viewBox.width, height: viewBox.height };
  const rootStyle = computeStyle(root, initialStyle(color), viewport, warn);
  if (!rootStyle.display || rootStyle.opacity <= 0) return { ...asset, ops: [] };
  const ops = wrap(
    children(root, rootStyle, viewport, 0),
    IDENTITY,
    rootStyle.opacity,
    null,
    IDENTITY,
  );
  return { ...asset, ops };
}
