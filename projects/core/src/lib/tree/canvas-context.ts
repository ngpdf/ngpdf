/** How `fill` decides what is inside a path that crosses itself. */
export type PdfCanvasFillRule = 'nonzero' | 'evenodd';

/** The shape at the open ends of a stroked line. */
export type PdfCanvasLineCap = 'butt' | 'round' | 'square';

/** The shape where two stroked segments meet. */
export type PdfCanvasLineJoin = 'miter' | 'round' | 'bevel';

/** The content box of a `pdf-canvas`, in points. */
export interface PdfCanvasSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Draws lines and shapes in a `pdf-canvas`, in points from the top left of its content box. Every
 * method returns the context, so calls chain. Colors take what the `color` style takes.
 */
export interface PdfCanvasContext {
  /** Starts a new subpath at (x, y). */
  moveTo(x: number, y: number): this;
  lineTo(x: number, y: number): this;
  /** A cubic Bézier curve through control points (c1x, c1y) and (c2x, c2y). */
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this;
  /** A quadratic Bézier curve through control point (cx, cy). */
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): this;
  /** Joins the current point to the start of its subpath. */
  closePath(): this;
  rect(x: number, y: number, width: number, height: number): this;
  roundedRect(x: number, y: number, width: number, height: number, radius: number): this;
  circle(cx: number, cy: number, radius: number): this;
  ellipse(cx: number, cy: number, radiusX: number, radiusY?: number): this;
  /** A closed shape through the points, each `[x, y]`. */
  polygon(...points: readonly (readonly [number, number])[]): this;

  /** Fills the path in `color`, or the fill color, and starts a new path. */
  fill(color?: string, rule?: PdfCanvasFillRule): this;
  /** Strokes the path in `color`, or the stroke color, and starts a new path. */
  stroke(color?: string): this;
  /** Fills, then strokes the path, and starts a new path. */
  fillAndStroke(fill?: string, stroke?: string): this;

  lineWidth(width: number): this;
  lineCap(cap: PdfCanvasLineCap): this;
  lineJoin(join: PdfCanvasLineJoin): this;
  /** Dashes the strokes that follow: one length for dashes and gaps alike, or a list of them. */
  dash(pattern: number | readonly number[], phase?: number): this;
  undash(): this;
  fillColor(color: string): this;
  strokeColor(color: string): this;
  /** Multiplies the opacity of what is painted next, from 0 to 1. */
  opacity(opacity: number): this;
  /** Keeps the colors, line settings, opacity and transform, for `restore`. */
  save(): this;
  restore(): this;

  translate(x: number, y: number): this;
  /** Turns what follows clockwise by `degrees` around the origin. */
  rotate(degrees: number): this;
  scale(x: number, y?: number): this;
}

/** The drawing of a `pdf-canvas`: called once per render, after layout, with its final size. */
export type PdfCanvasPaint = (ctx: PdfCanvasContext, size: PdfCanvasSize) => void;
