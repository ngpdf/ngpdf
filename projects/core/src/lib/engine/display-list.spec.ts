import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Yoga } from 'yoga-layout/load';
import { createNode, type PdfNode } from '../tree/node';
import { displayList, type DisplayListOptions } from './display-list';
import type { ImageAsset } from './images';
import type { LayoutContext } from './layout';
import { pageSize, paginatePage, type PageLayout } from './paginate';
import { resolveStyles } from './style';
import { createPdfkitWriter, type DrawOp, type PdfWriter } from './writer';

let yoga: Yoga;
let writer: PdfWriter;
beforeAll(async () => {
  const { loadYoga } = await import('yoga-layout/load');
  yoga = await loadYoga();
  writer = await createPdfkitWriter({ compress: false });
});

function el(
  tag: string,
  style: Record<string, string> = {},
  children: PdfNode[] = [],
  props: Record<string, unknown> = {},
): PdfNode {
  const node = createNode('element', tag);
  node.rawStyle = style;
  node.owner = { pdfProps: () => props };
  for (const child of children) {
    child.parent = node;
    node.children.push(child);
  }
  return node;
}

function text(content: string, style: Record<string, string> = {}): PdfNode {
  const node = el('pdf-text', style);
  const run = createNode('text', '', content);
  run.parent = node;
  node.children.push(run);
  return node;
}

function page(
  children: PdfNode[],
  style: Record<string, string> = { padding: '36' },
  props: Record<string, unknown> = { size: 'A4', orientation: 'portrait' },
): PdfNode {
  return el('pdf-page', style, children, props);
}

function layout(root: PdfNode, images = new Map<PdfNode, ImageAsset>()): PageLayout[] {
  const ctx: LayoutContext = { yoga, metrics: writer, images };
  return paginatePage(root, resolveStyles(root), ctx);
}

function list(
  laid: PageLayout,
  index: number,
  count: number,
  format?: string,
  options: Partial<DisplayListOptions> = {},
): DrawOp[] {
  return displayList(laid, index, count, format, { metrics: writer, ...options });
}

type Op<K extends DrawOp['op']> = Extract<DrawOp, { op: K }>;

const SQUARE = { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };

function only<K extends DrawOp['op']>(ops: readonly DrawOp[], kind: K): Op<K>[] {
  return ops.filter((op): op is Op<K> => op.op === kind);
}

describe('displayList', () => {
  it('draws a background rect before the ops of the box children', () => {
    const root = page([el('pdf-view', { 'background-color': '#DD0031' }, [text('Hello')])]);
    const ops = list(layout(root)[0]!, 0, 1);
    expect(ops.map((op) => op.op)).toEqual(['rect', 'text']);
    expect(ops[0]).toMatchObject({ op: 'rect', fill: '#dd0031', radii: SQUARE, opacity: 1 });
    expect(ops[1]).toMatchObject({ op: 'text', text: 'Hello', x: 36, y: 36 });
  });

  it('writes colors as #rrggbb and multiplies their alpha into the op opacity', () => {
    const view = el(
      'pdf-view',
      {
        'background-color': 'rgba(0, 0, 255, 0.5)',
        'border-top': '2 solid #ff000080',
        color: 'Red',
        opacity: '0.5',
      },
      [text('Faded', { color: 'rgb(0 128 0 / 50%)' }), text('Plain')],
    );
    const ops = list(layout(page([view]))[0]!, 0, 1);
    expect(only(ops, 'rect')[0]).toMatchObject({ fill: '#0000ff', opacity: 0.25 });
    expect(only(ops, 'line')[0]).toMatchObject({ color: '#ff0000', opacity: 0.5 * (0x80 / 255) });
    const [faded, plain] = only(ops, 'text');
    expect(faded).toMatchObject({ text: 'Faded', color: '#008000', opacity: 0.25 });
    expect(plain).toMatchObject({ text: 'Plain', color: '#ff0000', opacity: 0.5 });
  });

  it('paints nothing in a transparent color', () => {
    const view = el(
      'pdf-view',
      { 'background-color': 'transparent', border: '1 solid transparent', height: '40' },
      [text('Hidden', { color: 'transparent' }), text('Shown')],
    );
    const number = el('pdf-page-number', { color: 'rgba(0, 0, 0, 0)' });
    const ops = list(layout(page([view, number]))[0]!, 0, 1);
    expect(only(ops, 'rect')).toEqual([]);
    expect(only(ops, 'line')).toEqual([]);
    expect(only(ops, 'text').map((op) => op.text)).toEqual(['Shown']);
  });

  it('fades the content of a faded page once, in a row page as in a column page', () => {
    const opacityOf = (direction: string): number[] => {
      const child = el('pdf-view', { 'background-color': '#000', width: '20', height: '20' });
      const laid = layout(page([child], { opacity: '0.5', 'flex-direction': direction }));
      return only(list(laid[0]!, 0, 1), 'rect').map((op) => op.opacity);
    };
    expect(opacityOf('column')).toEqual([0.5]);
    expect(opacityOf('row')).toEqual([0.5]);
  });

  it('passes the corner radii and opacity to the background rect', () => {
    const style = {
      'background-color': '#000',
      'border-radius': '6 1 2 3',
      opacity: '0.5',
      height: '20',
    };
    const [rect] = only(list(layout(page([el('pdf-view', style)]))[0]!, 0, 1), 'rect');
    expect(rect).toMatchObject({
      radii: { topLeft: 6, topRight: 1, bottomRight: 2, bottomLeft: 3 },
      opacity: 0.5,
      h: 20,
    });
  });

  it('scales all radii down together when two of them overflow a side', () => {
    const radiiOf = (radius: string) => {
      const style = { 'background-color': '#000', 'border-radius': radius, width: '100' };
      const view = el('pdf-view', { ...style, height: '20' });
      return only(list(layout(page([view]))[0]!, 0, 1), 'rect')[0]!.radii;
    };
    expect(radiiOf('20')).toEqual({ topLeft: 10, topRight: 10, bottomRight: 10, bottomLeft: 10 });
    // The left side is the tightest: 20 / (30 + 0) wins over 20 / (10 + 0).
    const scaled = radiiOf('30 10 0 0');
    expect(scaled.topLeft).toBeCloseTo(20, 6);
    expect(scaled.topRight).toBeCloseTo(20 / 3, 6);
    expect(scaled).toMatchObject({ bottomRight: 0, bottomLeft: 0 });
    expect(radiiOf('10 10 0 0')).toEqual({
      topLeft: 10,
      topRight: 10,
      bottomRight: 0,
      bottomLeft: 0,
    });
  });

  describe('rounded borders', () => {
    const start = (path: Op<'path'>) => path.from;
    const end = (path: Op<'path'>) => path.segments.at(-1)!.to;
    const at = (cx: number, cy: number, r: number, degrees: number) => ({
      x: cx + r * Math.cos((degrees * Math.PI) / 180),
      y: cy + r * Math.sin((degrees * Math.PI) / 180),
    });
    const expectPoint = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
    };

    it('strokes each side along the rounded outline, meeting mid-corner', () => {
      const style = { width: '100', height: '40', border: '2 solid #f00', 'border-radius': '8' };
      const ops = list(layout(page([el('pdf-view', style)]))[0]!, 0, 1);
      expect(only(ops, 'line')).toEqual([]);
      const [top, right, bottom, left] = only(ops, 'path');
      expect(only(ops, 'path')).toHaveLength(4);
      for (const side of [top, right, bottom, left]) {
        expect(side).toMatchObject({ width: 2, color: '#ff0000', opacity: 1 });
      }
      // The box spans 36..136 by 36..76; the stroke runs 1pt inside it, on radius 7.
      expectPoint(start(top!), at(44, 44, 7, 225));
      expect(top!.segments.map((segment) => segment.kind)).toEqual(['curve', 'line', 'curve']);
      expectPoint(top!.segments[0]!.to, { x: 44, y: 37 });
      expectPoint(top!.segments[1]!.to, { x: 128, y: 37 });
      expectPoint(end(top!), at(128, 44, 7, 315));
      expectPoint(end(right!), at(128, 68, 7, 45));
      expectPoint(end(bottom!), at(44, 68, 7, 135));
      // The four sides close into one outline.
      expectPoint(start(right!), end(top!));
      expectPoint(start(bottom!), end(right!));
      expectPoint(start(left!), end(bottom!));
      expectPoint(start(top!), end(left!));
    });

    it('keeps each side in its own width and color up to the middle of the corner', () => {
      const style = {
        width: '100',
        height: '40',
        'border-top': '2 solid #f00',
        'border-left': '6 solid #00f',
        'border-radius': '10',
      };
      const ops = list(layout(page([el('pdf-view', style)]))[0]!, 0, 1);
      const [top, left] = only(ops, 'path');
      expect(only(ops, 'path')).toHaveLength(2);
      expect(top).toMatchObject({ width: 2, color: '#ff0000' });
      expect(left).toMatchObject({ width: 6, color: '#0000ff' });
      expectPoint(start(top!), at(46, 46, 9, 225));
      expectPoint(top!.segments[0]!.to, { x: 46, y: 37 });
      expectPoint(end(left!), at(46, 46, 7, 225));
      expect(left!.segments.some((s) => s.kind === 'line' && Math.abs(s.to.x - 39) < 1e-6)).toBe(
        true,
      );
    });

    it('draws a side as a square line where its corners are no wider than half its width', () => {
      const style = { width: '100', height: '40', border: '4 solid #000', 'border-radius': '2' };
      const ops = list(layout(page([el('pdf-view', style)]))[0]!, 0, 1);
      expect(only(ops, 'path')).toEqual([]);
      expect(only(ops, 'line')).toHaveLength(4);
      expect(only(ops, 'line')[0]).toMatchObject({ x1: 36, x2: 136, y1: 38, y2: 38 });
    });

    it('rounds only the corners a rounded side touches', () => {
      const style = {
        width: '100',
        height: '40',
        border: '2 solid #000',
        'border-radius': '0 0 8 0',
      };
      const ops = list(layout(page([el('pdf-view', style)]))[0]!, 0, 1);
      // Top and left touch square corners only.
      expect(only(ops, 'line')).toHaveLength(2);
      const [right, bottom] = only(ops, 'path');
      expect(right!.from).toEqual({ x: 135, y: 36 });
      expect(right!.segments.map((segment) => segment.kind)).toEqual(['line', 'curve']);
      expect(bottom!.segments.map((segment) => segment.kind)).toEqual(['curve', 'line']);
      expect(end(bottom!)).toEqual({ x: 36, y: 75 });
    });
  });

  it('draws one line per border side with a width', () => {
    const style = { 'border-top': '2 solid #f00', 'border-left': '1 solid #0f0', height: '30' };
    const ops = list(layout(page([el('pdf-view', style)]))[0]!, 0, 1);
    const lines = only(ops, 'line');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ y1: 37, y2: 37, width: 2, color: '#ff0000' });
    expect(lines[1]).toMatchObject({ x1: 36.5, x2: 36.5, y1: 36, y2: 66, width: 1 });
  });

  it('puts right-aligned text at box right minus padding minus line width', () => {
    const view = text('Total', { 'text-align': 'right', width: '200', padding: '10' });
    const ops = list(layout(page([view]))[0]!, 0, 1);
    const [line] = only(ops, 'text');
    const lineWidth = writer.widthOf('Total', 'Helvetica', 10);
    expect(line!.x).toBeCloseTo(36 + 200 - 10 - lineWidth, 6);
    expect(line!.y).toBe(46);
  });

  it('centers text and sets underline and strike flags', () => {
    const centered = text('Mid', { 'text-align': 'center', width: '100' });
    const under = text('U', { 'text-decoration': 'underline' });
    const struck = text('S', { 'text-decoration': 'line-through' });
    const ops = list(layout(page([centered, under, struck]))[0]!, 0, 1);
    const lines = only(ops, 'text');
    expect(lines[0]!.x).toBeCloseTo(36 + (100 - writer.widthOf('Mid', 'Helvetica', 10)) / 2, 6);
    expect(lines.map((l) => [l.underline, l.strike])).toEqual([
      [false, false],
      [true, false],
      [false, true],
    ]);
  });

  describe('text-align: justify', () => {
    const words = 'one two three four five six seven eight nine ten';
    const gapsOf = (line: string) => line.split(' ').length - 1;

    it('stretches the word gaps of every line but the last to the content width', () => {
      const box = text(words, { 'text-align': 'justify', width: '120', padding: '0 10' });
      const [laid] = layout(page([box]));
      const lines = laid!.placed[0]!.box.text!.lines;
      expect(lines.length).toBeGreaterThan(1);
      const ops = only(list(laid!, 0, 1), 'text');
      for (const [i, line] of lines.entries()) {
        const op = ops[i]!;
        expect(op.x).toBe(46);
        if (line.last) {
          expect(op.wordSpacing ?? 0).toBe(0);
        } else {
          expect(op.wordSpacing).toBeCloseTo((100 - line.width) / gapsOf(line.text), 6);
        }
      }
    });

    it('leaves a line without gaps and an overflowing word at the start', () => {
      const box = text('Antidisestablishment end', { 'text-align': 'justify', width: '40' });
      const ops = only(list(layout(page([box]))[0]!, 0, 1), 'text');
      expect(ops.length).toBeGreaterThan(1);
      for (const op of ops) {
        expect(op.x).toBe(36);
        expect(op.wordSpacing ?? 0).toBe(0);
      }
    });

    it('moves each run right by the gaps before it, across pdf-spans', () => {
      const bold = el('pdf-span', { 'font-weight': 'bold' });
      const run = createNode('text', '', 'two three');
      run.parent = bold;
      bold.children.push(run);
      const paragraph = el('pdf-text', { 'text-align': 'justify', width: '100' }, [
        createNode('text', '', 'one '),
        bold,
        createNode('text', '', ' four five six seven eight'),
      ]);
      for (const child of paragraph.children) child.parent = paragraph;
      const [laid] = layout(page([paragraph]));
      const first = laid!.placed[0]!.box.text!.lines[0]!;
      const ops = only(list(laid!, 0, 1), 'text').slice(0, first.runs.length);
      const gaps = gapsOf(first.text);
      const spacing = (100 - first.width) / gaps;
      expect(ops.map((op) => op.text)).toEqual(first.runs.map((r) => r.text));
      expect(ops[0]).toMatchObject({ x: 36, wordSpacing: spacing });
      // 'one ' ends with a gap, so the bold run starts one spacing further right.
      expect(ops[1]!.x).toBeCloseTo(36 + first.runs[1]!.x + spacing, 6);
      expect(ops[2]!.x).toBeCloseTo(36 + first.runs[2]!.x + 2 * spacing, 6);
    });

    it('keeps the last line of each piece of a split paragraph justified unless it ends the text', () => {
      const lines = Array.from({ length: 6 }, () => 'aa bb').join(' ');
      const box = text(lines, { 'text-align': 'justify', width: '30', 'line-height': '1' });
      const filler = el('pdf-view', { height: String(841.89 - 72 - 30) });
      const pages = layout(page([filler, box]));
      expect(pages).toHaveLength(2);
      const firstPage = only(list(pages[0]!, 0, 2), 'text');
      expect(firstPage.length).toBeGreaterThan(0);
      for (const op of firstPage) expect(op.wordSpacing).toBeGreaterThan(0);
      expect(only(list(pages[1]!, 1, 2), 'text').at(-1)!.wordSpacing ?? 0).toBe(0);
    });
  });

  it('draws each pdf-span run in its own size, color and decoration on one baseline', () => {
    const span = (style: Record<string, string>, content: string): PdfNode => {
      const node = el('pdf-span', style);
      const run = createNode('text', '', content);
      run.parent = node;
      node.children.push(run);
      return node;
    };
    const paragraph = el('pdf-text', {}, [
      createNode('text', '', 'Pay '),
      span({ 'font-size': '20', color: '#b00' }, 'now'),
      createNode('text', '', ' '),
      span({ 'text-decoration': 'underline' }, 'here'),
      span({ color: 'transparent' }, ' hidden'),
    ]);
    for (const child of paragraph.children) child.parent = paragraph;
    const ops = only(list(layout(page([paragraph]))[0]!, 0, 1), 'text');
    expect(ops.map(({ text, size, color, underline }) => [text, size, color, underline])).toEqual([
      ['Pay ', 10, '#000000', false],
      ['now', 20, '#bb0000', false],
      [' ', 10, '#000000', false],
      ['here', 10, '#000000', true],
    ]);
    const baseline = 36 + writer.ascent('Helvetica', 20);
    expect(ops[0]!.y).toBeCloseTo(baseline - writer.ascent('Helvetica', 10), 6);
    expect(ops[1]!.y).toBeCloseTo(36, 6);
  });

  it('draws the page number from the format with page and total', () => {
    const number = el('pdf-page-number', { height: '9' }, [], { format: '{page} / {total}' });
    const [first] = layout(page([text('a'), number]));
    const ops = list(first!, 1, 5, 'Página {page} de {total}', { metrics: writer });
    const last = only(ops, 'text').at(-1)!;
    expect(last.text).toBe('Página 2 de 5');
    // Right-aligned by default, inside the padding.
    expect(last.x).toBeCloseTo(595.28 - 36 - writer.widthOf('Página 2 de 5', 'Helvetica', 10), 3);
  });

  it('draws a nested page number with the numbers of the sheet it lands on', () => {
    const number = el('pdf-page-number', {}, [], { format: 'p{page}/{total}' });
    const [first] = layout(page([text('a'), el('pdf-view', {}, [number])]));
    expect(first!.pageNumber).toBeUndefined();
    expect(only(list(first!, 2, 7), 'text').map((op) => op.text)).toEqual(['a', 'p3/7']);
  });

  it('draws a page number in a fixed view on every sheet', () => {
    const header = el(
      'pdf-view',
      {},
      [el('pdf-page-number', {}, [], { format: 'Page {page} of {total}' })],
      {
        fixed: 'top',
      },
    );
    const blocks = [el('pdf-view', { height: '500' }), el('pdf-view', { height: '500' })];
    const sheets = layout(page([header, ...blocks]));
    expect(sheets).toHaveLength(2);
    const numbers = sheets.map((sheet, i) => only(list(sheet, i, sheets.length), 'text')[0]?.text);
    expect(numbers).toEqual(['Page 1 of 2', 'Page 2 of 2']);
  });

  it('aligns a nested page number inside its box by text-align', () => {
    const number = el('pdf-page-number', { width: '100', 'text-align': 'right' }, [], {
      format: '{page}',
    });
    const [first] = layout(page([el('pdf-view', { 'flex-direction': 'row' }, [number])]));
    const [op] = only(list(first!, 0, 1), 'text');
    expect(op!.x).toBeCloseTo(36 + 100 - writer.widthOf('1', 'Helvetica', 10), 3);
    expect(op!.y).toBeCloseTo(36, 3);
  });

  it('passes letter-spacing to the text op and aligns by the spaced width', () => {
    const view = text('Total', { 'text-align': 'right', width: '200', 'letter-spacing': '2' });
    const [op] = only(list(layout(page([view]))[0]!, 0, 1), 'text');
    expect(op!.letterSpacing).toBe(2);
    expect(op!.x).toBeCloseTo(36 + 200 - writer.widthOf('Total', 'Helvetica', 10) - 5 * 2, 6);
    const [plain] = only(list(layout(page([text('Total')]))[0]!, 0, 1), 'text');
    expect(plain).not.toHaveProperty('letterSpacing');
  });

  it('justifies letter-spaced text by its spaced width, with word spacing on top', () => {
    const words = 'ab cd ef gh ij kl mn op';
    const view = text(words, { width: '100', 'text-align': 'justify', 'letter-spacing': '1' });
    const [laid] = layout(page([view]));
    const ops = only(list(laid!, 0, 1), 'text');
    const first = ops[0]!;
    expect(first.letterSpacing).toBe(1);
    const lineText = first.text;
    const gaps = lineText.split(' ').length - 1;
    const spaced = writer.widthOf(lineText, 'Helvetica', 10) + lineText.length * 1;
    // Without a trailing space drawn, the gaps take what is left of the 100pt.
    expect(first.wordSpacing).toBeCloseTo((100 - spaced) / gaps, 6);
  });

  it('spaces the page number but leaves its text untransformed', () => {
    const number = el(
      'pdf-page-number',
      { height: '9', 'letter-spacing': '1', 'text-transform': 'uppercase' },
      [],
      { format: 'p{page}' },
    );
    const [first] = layout(page([text('a'), number]));
    const last = only(list(first!, 0, 1), 'text').at(-1)!;
    expect(last).toMatchObject({ text: 'p1', letterSpacing: 1 });
    expect(last.x).toBeCloseTo(595.28 - 36 - writer.widthOf('p1', 'Helvetica', 10) - 2, 3);
  });

  it('reads the format from the page number props and replaces every placeholder', () => {
    const number = el('pdf-page-number', {}, [], { format: '{page}-{page}/{total}$&' });
    const [first] = layout(page([number]));
    const last = only(list(first!, 0, 3), 'text').at(-1)!;
    expect(last.text).toBe('1-1/3$&');
  });

  it('reports characters of the page number format outside WinAnsi', () => {
    const number = el('pdf-page-number', {}, [], { format: 'Ω {page}' });
    const warn = vi.fn<(chars: string[]) => void>();
    const [first] = layout(page([number]));
    const last = only(list(first!, 0, 1, undefined, { warn }), 'text').at(-1)!;
    expect(last.text).toBe('? 1');
    expect(warn).toHaveBeenCalledWith(['Ω']);
  });

  it('uses the default format when the page number has no props', () => {
    const number = el('pdf-page-number');
    number.owner = null;
    const [first] = layout(page([number]));
    expect(only(list(first!, 0, 2), 'text').at(-1)!.text).toBe('1 / 2');
  });

  it('gives a landscape A4 page the swapped size', () => {
    const root = page([text('x')], { padding: '36' }, { size: 'A4', orientation: 'landscape' });
    expect(pageSize(root).width).toBe(841.89);
    expect(layout(root)[0]!.width).toBe(841.89);
  });

  it('draws the page decoration before the units', () => {
    const root = page([text('x')], { padding: '36', 'background-color': '#eee' });
    const ops = list(layout(root)[0]!, 0, 1);
    expect(ops[0]).toMatchObject({ op: 'rect', fill: '#eeeeee', x: 0, y: 0, w: 595.28 });
  });

  describe('layout-resolved insets', () => {
    const view = (inner: PdfNode, style: Record<string, string> = {}): PdfNode =>
      el('pdf-view', style, [inner]);

    it('uses the padding Yoga computed for percent padding on a page child', () => {
      const unit = text('pct', { padding: '10%', 'background-color': '#eee' });
      const laid = layout(page([unit]))[0]!;
      // Content width is 595.28 - 72; 10% of that, not of the page width.
      const pad = ((595.28 - 72) * 10) / 100;
      const [line] = only(list(laid, 0, 1), 'text');
      expect(line!.x).toBeCloseTo(36 + pad, 3);
      expect(line!.y).toBeCloseTo(36 + pad, 3);
    });

    it('resolves percent padding against the wrapper content width when nested', () => {
      const unit = text('in', { padding: '10%', 'text-align': 'right' });
      const wrapper = view(unit, { width: '300', padding: '20' });
      const laid = layout(page([wrapper]))[0]!;
      const [line] = only(list(laid, 0, 1), 'text');
      // Wrapper content width 260, so the text box padding is 26 on each side.
      const width = writer.widthOf('in', 'Helvetica', 10);
      expect(line!.x).toBeCloseTo(36 + 20 + 260 - 26 - width, 2);
    });

    it('clips an image to the content box of a percent-padded box', () => {
      const image = el('pdf-image', { width: '200', height: '100', padding: '5%' });
      const asset: ImageAsset = { data: new Uint8Array([1]), width: 10, height: 10 };
      const laid = layout(page([image]), new Map([[image, asset]]))[0]!;
      const [op] = only(list(laid, 0, 1), 'image');
      const pad = (523.28 * 5) / 100;
      expect(op!.clip.x).toBeCloseTo(36 + pad, 3);
      expect(op!.clip.w).toBeCloseTo(200 - 2 * pad, 3);
    });
  });

  describe('opacity', () => {
    it('multiplies down the tree and reaches every op kind', () => {
      const inner = text('x', { opacity: '0.5', 'text-decoration': 'underline' });
      const outer = el(
        'pdf-view',
        { opacity: '0.5', 'background-color': '#000', border: '1 solid #f00' },
        [inner],
      );
      const ops = list(layout(page([outer]))[0]!, 0, 1);
      expect(only(ops, 'rect')[0]!.opacity).toBe(0.5);
      expect(only(ops, 'text')[0]!.opacity).toBe(0.25);
      for (const line of only(ops, 'line')) expect(line.opacity).toBe(0.5);
    });

    it('applies the inherited opacity to images', () => {
      const image = el('pdf-image', { width: '10', height: '10', opacity: '0.5' });
      const asset: ImageAsset = { data: new Uint8Array([1]), width: 10, height: 10 };
      const outer = el('pdf-view', { opacity: '0.5' }, [image]);
      const ops = list(layout(page([outer]), new Map([[image, asset]]))[0]!, 0, 1);
      expect(only(ops, 'image')[0]!.opacity).toBe(0.25);
    });
  });

  describe('slices', () => {
    function sliced(): PageLayout[] {
      const rows = [0, 1, 2].map(() => el('pdf-view', { height: '300' }));
      const wrapper = el('pdf-view', { border: '2 solid #123456' }, rows);
      return layout(page([wrapper]));
    }

    it('draws no border on an edge cut by a page break', () => {
      const pages = sliced();
      expect(pages).toHaveLength(2);
      const horizontal = (index: number): Op<'line'>[] =>
        only(list(pages[index]!, index, 2), 'line').filter((l) => l.y1 === l.y2);
      // Page 1 keeps the top edge only; page 2 keeps the bottom edge only.
      expect(horizontal(0)).toHaveLength(1);
      expect(horizontal(0)[0]!.y1).toBeCloseTo(37, 6);
      expect(horizontal(1)).toHaveLength(1);
      expect(horizontal(1)[0]!.y1).toBeGreaterThan(37);
      for (const index of [0, 1]) {
        const vertical = only(list(pages[index]!, index, 2), 'line').filter((l) => l.x1 === l.x2);
        expect(vertical).toHaveLength(2);
      }
    });

    it('keeps square corners on an edge cut by a page break', () => {
      const rows = [0, 1, 2].map(() => el('pdf-view', { height: '300' }));
      const style = { border: '2 solid #123456', 'border-radius': '8', 'background-color': '#eee' };
      const pages = layout(page([el('pdf-view', style, rows)]));
      expect(pages).toHaveLength(2);
      const ops = pages.map((laid, index) => list(laid, index, 2));
      expect(only(ops[0]!, 'rect')[0]!.radii).toEqual({ ...SQUARE, topLeft: 8, topRight: 8 });
      expect(only(ops[1]!, 'rect')[0]!.radii).toEqual({
        ...SQUARE,
        bottomRight: 8,
        bottomLeft: 8,
      });
      for (const [index, pageOps] of ops.entries()) {
        // Top, right and left on the first page; right, bottom and left on the second.
        const paths = only(pageOps, 'path');
        expect(paths).toHaveLength(3);
        const rect = only(pageOps, 'rect')[0]!;
        const cutY = index === 0 ? rect.y + rect.h : rect.y;
        const ends = paths.flatMap((path) => [path.from, path.segments.at(-1)!.to]);
        // The sides reach the cut straight, so they end on it.
        expect(ends.filter((point) => Math.abs(point.y - cutY) < 1e-6)).toHaveLength(2);
      }
    });
  });

  describe('clipping', () => {
    function tall(): PageLayout {
      const spacer = el('pdf-view', { height: '780' });
      const column = el('pdf-view', { 'flex-grow': '1' }, [
        text('visible'),
        spacer,
        text('hidden'),
      ]);
      // A row view is one unit, so the page cannot split it.
      const style = { 'flex-direction': 'row', 'background-color': '#abc' };
      const unit = el('pdf-view', { ...style, 'border-bottom': '2 solid #000' }, [column]);
      return layout(page([unit, el('pdf-page-number', { height: '9' }, [], { format: 'n' })]))[0]!;
    }

    it('draws nothing below clipBottom', () => {
      const laid = tall();
      const limit = laid.placed[0]!.clipBottom!;
      expect(limit).toBeCloseTo(841.89 - 36 - 9, 6);
      const ops = list(laid, 0, 1).filter((op) => op.op !== 'text' || op.text !== 'n');
      for (const op of ops) {
        if (op.op === 'rect') expect(op.y + op.h).toBeLessThanOrEqual(limit + 1e-6);
        if (op.op === 'text') expect(op.y + op.size * 1.2).toBeLessThanOrEqual(limit + 1e-6);
        if (op.op === 'line') expect(Math.max(op.y1, op.y2)).toBeLessThanOrEqual(limit + 1e-6);
      }
      expect(only(ops, 'text').map((t) => t.text)).toEqual(['visible']);
      expect(only(ops, 'rect')).toHaveLength(1);
      // The bottom border lies below the limit and is dropped.
      expect(only(ops, 'line')).toHaveLength(0);
    });

    it('keeps square corners and rounded sides above clipBottom', () => {
      const spacer = el('pdf-view', { height: '900' });
      const style = {
        'flex-direction': 'row',
        'background-color': '#abc',
        border: '2 solid #000',
        'border-radius': '8',
      };
      const laid = layout(page([el('pdf-view', style, [spacer])]))[0]!;
      const limit = laid.placed[0]!.clipBottom!;
      const ops = list(laid, 0, 1);
      expect(only(ops, 'rect')[0]!.radii).toEqual({ ...SQUARE, topLeft: 8, topRight: 8 });
      const paths = only(ops, 'path');
      // Top, right and left; the bottom side lies below the limit.
      expect(paths).toHaveLength(3);
      for (const path of paths) {
        const points = [path.from, ...path.segments.map((segment) => segment.to)];
        for (const point of points) expect(point.y).toBeLessThanOrEqual(limit + 1e-6);
      }
      const lowest = Math.max(...paths.map((path) => path.segments.at(-1)!.to.y));
      expect(lowest).toBeCloseTo(limit, 6);
    });
  });

  describe('transform', () => {
    const kinds = (ops: readonly DrawOp[]) => ops.map((op) => op.op);
    type Matrix = Op<'transform'>['matrix'];

    function expectMatrix(actual: Matrix, expected: readonly number[]): void {
      expect(actual).toHaveLength(6);
      actual.forEach((value, i) => {
        expect(value).toBeCloseTo(expected[i]!, 9);
      });
    }

    /** One 100x40 view at the content origin (36, 36), with the given style. */
    function card(style: Record<string, string>, children: PdfNode[] = [text('Hi')]): DrawOp[] {
      const view = el('pdf-view', { width: '100', height: '40', ...style }, children);
      return list(layout(page([view]))[0]!, 0, 1);
    }

    it('wraps the whole box, background, border and text, in transform and untransform', () => {
      const ops = card({
        transform: 'rotate(90deg)',
        'background-color': '#eee',
        'border-bottom': '1 solid #000',
      });
      expect(kinds(ops)).toEqual(['transform', 'rect', 'line', 'text', 'untransform']);
    });

    it('rotates clockwise around the center of the border box by default', () => {
      const [op] = only(card({ transform: 'rotate(90deg)' }), 'transform');
      // Center (86, 56): x' = -(y - 56) + 86, y' = (x - 86) + 56.
      expectMatrix(op!.matrix, [0, 1, -1, 0, 142, -30]);
    });

    it('applies the functions left to right, as CSS does', () => {
      const origin = { 'transform-origin': 'left top' };
      const [moved] = only(
        card({ ...origin, transform: 'translate(10pt) rotate(90deg)' }),
        'transform',
      );
      // T(36,36) · T(10,0) · R(90) · T(-36,-36)
      expectMatrix(moved!.matrix, [0, 1, -1, 0, 82, 0]);
      const [turned] = only(
        card({ ...origin, transform: 'rotate(90deg) translate(10pt)' }),
        'transform',
      );
      // T(36,36) · R(90) · T(10,0) · T(-36,-36): the translation turns with the box.
      expectMatrix(turned!.matrix, [0, 1, -1, 0, 72, 10]);
    });

    it('resolves translate percentages and the origin against the border box', () => {
      const [op] = only(
        card({ transform: 'translate(50%, -25%) scale(2, 3)', 'transform-origin': '10% 1in' }),
        'transform',
      );
      // Origin (36 + 10, 36 + 72); translate (50, -10); then scale about the origin.
      expectMatrix(op!.matrix, [2, 0, 0, 3, -46 + 50, -216 - 10]);
    });

    it('leaves the layout as it is: the text sits where it would untransformed', () => {
      const plain = only(card({}), 'text')[0]!;
      const turned = only(card({ transform: 'rotate(30deg) scale(2)' }), 'text')[0]!;
      expect(turned).toEqual(plain);
    });

    it('nests transforms, draws an image inside one and adds none without a transform', () => {
      const asset: ImageAsset = { data: new Uint8Array([1]), width: 10, height: 10 };
      const image = el('pdf-image', { width: '10', height: '10', transform: 'scale(2)' });
      const inner = el('pdf-view', { transform: 'rotate(1rad)' }, [text('Hello')]);
      const outer = el('pdf-view', { transform: 'translateY(5pt)' }, [inner, image]);
      const plain = el('pdf-view', {}, [text('Plain')]);
      const empty = el('pdf-view', { transform: 'rotate(10deg)', height: '10' });
      const laid = layout(page([outer, plain, empty]), new Map([[image, asset]]))[0]!;
      expect(kinds(list(laid, 0, 1))).toEqual([
        'transform',
        'transform',
        'text',
        'untransform',
        'transform',
        'image',
        'untransform',
        'untransform',
        'text',
      ]);
    });

    it('transforms a fixed view on every sheet', () => {
      const header = el('pdf-view', { height: '20', transform: 'rotate(-5deg)' }, [text('Top')], {
        fixed: 'top',
      });
      const blocks = Array.from({ length: 3 }, () => el('pdf-view', { height: '500' }));
      const pages = layout(page([header, ...blocks]));
      expect(pages).toHaveLength(3);
      for (const [index, laid] of pages.entries()) {
        expect(kinds(list(laid, index, pages.length))).toEqual([
          'transform',
          'text',
          'untransform',
        ]);
      }
    });

    it('transforms a page number', () => {
      const number = el('pdf-page-number', { transform: 'rotate(90deg)' }, [], { format: 'n' });
      expect(kinds(list(layout(page([number]))[0]!, 0, 1))).toEqual([
        'transform',
        'text',
        'untransform',
      ]);
    });
  });

  describe('overflow: hidden', () => {
    const CONTENT_WIDTH = 595.28 - 72;
    const kinds = (ops: readonly DrawOp[]) => ops.map((op) => op.op);

    it('clips the content to the padding box, after the background and border', () => {
      const style = {
        overflow: 'hidden',
        'background-color': '#eee',
        border: '2 solid #000',
        padding: '4',
        'border-radius': '10',
      };
      const laid = layout(page([el('pdf-view', style, [text('Hello')])]))[0]!;
      const ops = list(laid, 0, 1);
      expect(kinds(ops)).toEqual([
        'rect',
        'path',
        'path',
        'path',
        'path',
        'clip',
        'text',
        'unclip',
      ]);
      const box = laid.placed[0]!.box;
      const clip = only(ops, 'clip')[0]!;
      expect(clip).toMatchObject({ x: 38, y: 38, h: box.h - 4 });
      expect(clip.w).toBeCloseTo(CONTENT_WIDTH - 4, 3);
      // Each corner's radius less the wider border beside it.
      expect(clip.radii).toEqual({ topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 });
    });

    it('takes the wider adjacent border off each corner, never below 0', () => {
      const style = {
        overflow: 'hidden',
        'border-width': '2 6 2 12',
        'border-radius': '10 10 4 4',
      };
      const ops = list(layout(page([el('pdf-view', style, [text('Hello')])]))[0]!, 0, 1);
      expect(only(ops, 'clip')[0]!.radii).toEqual({
        topLeft: 0,
        topRight: 4,
        bottomRight: 0,
        bottomLeft: 0,
      });
    });

    it('puts the clip inside the transform of the same box', () => {
      const style = { overflow: 'hidden', transform: 'rotate(10deg)' };
      const ops = list(layout(page([el('pdf-view', style, [text('Hello')])]))[0]!, 0, 1);
      const order = ops
        .map((op) => op.op)
        .filter((kind) => ['transform', 'clip', 'unclip', 'untransform'].includes(kind));
      expect(order).toEqual(['transform', 'clip', 'unclip', 'untransform']);
    });

    it('scales the inner radii down to fit the clip', () => {
      const style = {
        overflow: 'hidden',
        width: '100',
        height: '200',
        'border-width': '30',
        'border-radius': '80 20 0 0',
      };
      const ops = list(layout(page([el('pdf-view', style, [text('Hello')])]))[0]!, 0, 1);
      const [clip] = only(ops, 'clip');
      expect(clip!.w).toBeCloseTo(40, 6);
      // 50 and 0 across a 40pt-wide side: scaled by 0.8.
      expect(clip!.radii.topLeft).toBeCloseTo(40, 6);
      expect([clip!.radii.topRight, clip!.radii.bottomRight, clip!.radii.bottomLeft]).toEqual([
        0, 0, 0,
      ]);
    });

    it('clips text, an image and a page number drawn by the box itself', () => {
      const asset: ImageAsset = { data: new Uint8Array([1]), width: 100, height: 50 };
      const image = el('pdf-image', {
        overflow: 'hidden',
        width: '40',
        height: '40',
        'object-fit': 'cover',
      });
      const paragraph = text('Hello', { overflow: 'hidden', height: '6' });
      const number = el('pdf-page-number', { overflow: 'hidden' }, [], { format: 'n' });
      const laid = layout(
        page([image, paragraph, el('pdf-view', {}, [number])]),
        new Map([[image, asset]]),
      );
      expect(kinds(list(laid[0]!, 0, 1))).toEqual([
        'clip',
        'image',
        'unclip',
        'clip',
        'text',
        'unclip',
        'clip',
        'text',
        'unclip',
      ]);
    });

    it('nests the clips of nested views and adds none without overflow: hidden', () => {
      const inner = el('pdf-view', { overflow: 'hidden', padding: '3' }, [text('Hello')]);
      const outer = el('pdf-view', { overflow: 'hidden' }, [inner, text('World')]);
      const plain = el('pdf-view', {}, [text('Plain')]);
      const empty = el('pdf-view', { overflow: 'hidden', height: '10' });
      const ops = list(layout(page([outer, plain, empty]))[0]!, 0, 1);
      expect(kinds(ops)).toEqual(['clip', 'clip', 'text', 'unclip', 'text', 'unclip', 'text']);
      const [outerClip, innerClip] = only(ops, 'clip');
      expect(innerClip!.y).toBe(outerClip!.y);
      expect(innerClip!.radii).toEqual(SQUARE);
    });

    it('cuts the clip at clipBottom with square bottom corners', () => {
      const style = { overflow: 'hidden', border: '2 solid #000', 'border-radius': '8' };
      const card = el('pdf-view', style, [el('pdf-view', { height: '900' }), text('lost')]);
      const laid = layout(page([card]))[0]!;
      const limit = laid.placed[0]!.clipBottom!;
      const ops = list(laid, 0, 1);
      const clip = only(ops, 'clip')[0]!;
      expect(clip.y).toBe(38);
      expect(clip.y + clip.h).toBeCloseTo(limit, 6);
      expect(clip.radii).toEqual({ ...SQUARE, topLeft: 6, topRight: 6 });
      expect(only(ops, 'unclip')).toHaveLength(1);
    });
  });

  describe('images', () => {
    const asset: ImageAsset = { data: new Uint8Array([1]), width: 100, height: 50 };

    function drawn(fit: string, extra: Record<string, string> = {}): Op<'image'> {
      const image = el('pdf-image', { width: '40', height: '40', 'object-fit': fit, ...extra });
      const ops = list(layout(page([image]), new Map([[image, asset]]))[0]!, 0, 1);
      return only(ops, 'image')[0]!;
    }

    it('fits the image in the box and clips it to the box', () => {
      const op = drawn('contain');
      expect(op).toMatchObject({ x: 36, w: 40, h: 20, opacity: 1, data: asset.data });
      expect(op.y).toBe(36 + 10);
      expect(op.clip).toEqual({ x: 36, y: 36, w: 40, h: 40 });
    });

    it('lets cover overflow the box but not the clip', () => {
      const op = drawn('cover', { opacity: '0.5', padding: '4' });
      expect(op.opacity).toBe(0.5);
      expect(op.w).toBeGreaterThan(op.clip.w);
      expect(op.clip).toEqual({ x: 40, y: 40, w: 32, h: 32 });
    });

    const rowOf = (child: PdfNode): PdfNode =>
      el('pdf-view', { 'flex-direction': 'row', height: '1000' }, [child]);

    it('cuts the image clip at clipBottom and drops an image below it', () => {
      const spacer = el('pdf-view', { height: '760' });
      const image = el('pdf-image', { width: '100', height: '100' });
      const unit = rowOf(el('pdf-view', {}, [spacer, image]));
      const laid = layout(page([unit]), new Map([[image, asset]]))[0]!;
      const [op] = only(list(laid, 0, 1), 'image');
      expect(op!.clip.y + op!.clip.h).toBeCloseTo(841.89 - 36, 6);
      const hidden = rowOf(el('pdf-view', {}, [el('pdf-view', { height: '900' }), image]));
      const none = layout(page([hidden]), new Map([[image, asset]]))[0]!;
      expect(only(list(none, 0, 1), 'image')).toHaveLength(0);
    });
  });
});

describe('gradient backgrounds', () => {
  const RED = { color: '#ff0000', opacity: 1 };
  const BLUE = { color: '#0000ff', opacity: 1 };

  /** The background rect of a 100x50 view at (36, 36) on an A4 page. */
  function rectOf(style: Record<string, string>, w = '100', h = '50'): Op<'rect'> {
    const view = el('pdf-view', { width: w, height: h, ...style });
    const rects = only(list(layout(page([view]))[0]!, 0, 1), 'rect');
    expect(rects).toHaveLength(1);
    return rects[0]!;
  }

  function linear(style: Record<string, string>) {
    const { gradient } = rectOf(style);
    if (gradient?.kind !== 'linear') throw new Error('expected a linear gradient');
    return gradient;
  }

  function radial(style: Record<string, string>) {
    const { gradient } = rectOf(style);
    if (gradient?.kind !== 'radial') throw new Error('expected a radial gradient');
    return gradient;
  }

  function expectPoints<T extends object>(actual: T, expected: Partial<Record<keyof T, number>>) {
    for (const [key, value] of Object.entries(expected)) {
      expect(actual[key as keyof T]).toBeCloseTo(value as number, 6);
    }
  }

  it('fills the border box top to bottom by default, with the radii and no color', () => {
    const rect = rectOf({
      'background-image': 'linear-gradient(red, blue)',
      'border-radius': '6',
    });
    expect(rect).toMatchObject({ x: 36, y: 36, w: 100, h: 50, opacity: 1 });
    expect(rect.radii).toEqual({ topLeft: 6, topRight: 6, bottomRight: 6, bottomLeft: 6 });
    expect(rect.fill).toBeUndefined();
    expect(rect.gradient).toEqual({
      kind: 'linear',
      x1: 86,
      y1: 36,
      x2: 86,
      y2: 86,
      stops: [
        { offset: 0, ...RED },
        { offset: 1, ...BLUE },
      ],
    });
  });

  it('keeps the background color under the gradient in the same op', () => {
    const rect = rectOf({ background: 'linear-gradient(red, blue) #eeeeee', opacity: '0.5' });
    expect(rect).toMatchObject({ fill: '#eeeeee', opacity: 0.5, gradient: { kind: 'linear' } });
  });

  it('makes an angled gradient line long enough to reach the corners', () => {
    // |100 sin 45| + |50 cos 45| = 150 / sqrt 2, centered on (86, 61).
    expectPoints(linear({ 'background-image': 'linear-gradient(45deg, red, blue)' }), {
      x1: 48.5,
      y1: 98.5,
      x2: 123.5,
      y2: 23.5,
    });
    expectPoints(linear({ 'background-image': 'linear-gradient(to left, red, blue)' }), {
      x1: 136,
      y1: 61,
      x2: 36,
      y2: 61,
    });
  });

  it('points a corner gradient so its middle line joins the other two corners', () => {
    // The direction is (50, -100) normalized, and the line is 200 / sqrt 5 long.
    expectPoints(linear({ 'background-image': 'linear-gradient(to top right, red, blue)' }), {
      x1: 66,
      y1: 101,
      x2: 106,
      y2: 21,
    });
    expectPoints(linear({ 'background-image': 'linear-gradient(to bottom left, red, blue)' }), {
      x1: 106,
      y1: 21,
      x2: 66,
      y2: 101,
    });
  });

  it('spreads unpositioned stops, raises ones that go backwards and spans the first to the last', () => {
    const gradient = linear({
      height: '100',
      'background-image': 'linear-gradient(red 20px, lime, blue 50%, yellow 10%, white 80%)',
    });
    // Stops at 20, 35, 50, 50 and 80 of a 100 point line: the shading runs from y 56 to y 116.
    expectPoints(gradient, { x1: 86, y1: 56, x2: 86, y2: 116 });
    const offsets = gradient.stops.map((stop) => Math.round(stop.offset * 1e9) / 1e9);
    expect(offsets).toEqual([0, 0.25, 0.5, 0.5, 1]);
    expect(gradient.stops.map((stop) => stop.color)).toEqual([
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#ffff00',
      '#ffffff',
    ]);
  });

  it('pads a hard edge at an end, so the shading extends the right color', () => {
    const gradient = linear({ 'background-image': 'linear-gradient(red 40%, blue 40%)' });
    expectPoints(gradient, { y1: 55, y2: 57 });
    expect(gradient.stops).toEqual([
      { offset: 0, ...RED },
      { offset: 0.5, ...RED },
      { offset: 0.5, ...BLUE },
      { offset: 1, ...BLUE },
    ]);
    // A radial gradient has nothing before its center to pad.
    const ring = radial({ 'background-image': 'radial-gradient(red 0, blue 0, lime)' });
    expect(ring.r1).toBe(0);
    expect(ring.stops.map((stop) => stop.offset)).toEqual([0, 0, 1]);
  });

  it('multiplies stop alpha and element opacity into each stop opacity', () => {
    const gradient = linear({
      opacity: '0.5',
      'background-image': 'linear-gradient(rgba(255, 0, 0, 0.5), blue)',
    });
    expect(gradient.stops.map((stop) => stop.opacity)).toEqual([0.25, 0.5]);
  });

  it('gives a transparent stop the color of its neighbours, so it fades without darkening', () => {
    expect(linear({ 'background-image': 'linear-gradient(red, transparent)' }).stops).toEqual([
      { offset: 0, ...RED },
      { offset: 1, color: '#ff0000', opacity: 0 },
    ]);
    expect(linear({ 'background-image': 'linear-gradient(red, transparent, blue)' }).stops).toEqual(
      [
        { offset: 0, ...RED },
        { offset: 0.5, color: '#ff0000', opacity: 0 },
        { offset: 0.5, color: '#0000ff', opacity: 0 },
        { offset: 1, ...BLUE },
      ],
    );
  });

  it('fades to transparent between two stops of one color without a second edge', () => {
    expect(linear({ 'background-image': 'linear-gradient(red, transparent, red)' }).stops).toEqual([
      { offset: 0, ...RED },
      { offset: 0.5, color: '#ff0000', opacity: 0 },
      { offset: 1, ...RED },
    ]);
  });

  it('draws nothing for a gradient of transparent stops or a box without area', () => {
    const rects = (style: Record<string, string>) => {
      const view = el('pdf-view', { height: '10', ...style });
      return only(list(layout(page([view]))[0]!, 0, 1), 'rect');
    };
    expect(rects({ 'background-image': 'linear-gradient(transparent, rgba(0, 0, 0, 0))' })).toEqual(
      [],
    );
    expect(rects({ 'background-image': 'radial-gradient(transparent, transparent)' })).toEqual([]);
    for (const direction of ['to right', 'to top right']) {
      const image = `linear-gradient(${direction}, red, blue)`;
      expect(rects({ width: '0', height: '0', 'background-image': image })).toEqual([]);
    }
  });

  it('sizes a radial gradient by its shape, size keyword and center', () => {
    const at = (head: string) =>
      radial({ 'background-image': `radial-gradient(${head}, red, blue)` });
    // Centered in 100x50: the corner is (50, 25) away.
    expect(at('circle')).toMatchObject({ cx: 86, cy: 61, r1: 0, scaleY: 1 });
    expect(at('circle').r2).toBeCloseTo(Math.hypot(50, 25), 6);
    // An ellipse keeps the farthest-side ratio, 50:25, and passes through the corner.
    expect(at('ellipse').r2).toBeCloseTo(Math.hypot(50, 50), 6);
    expect(at('ellipse').scaleY).toBeCloseTo(0.5, 9);
    // At (20, 10) from the top-left corner: the sides are 20, 80, 10 and 40 away.
    expect(at('circle closest-side at 20 10')).toMatchObject({ cx: 56, cy: 46, r2: 10 });
    expect(at('circle farthest-side at 20 10').r2).toBe(80);
    expect(at('circle closest-corner at 20 10').r2).toBeCloseTo(Math.hypot(20, 10), 6);
    expect(at('circle farthest-corner at 20 10').r2).toBeCloseTo(Math.hypot(80, 40), 6);
    expect(at('closest-side at 20 10')).toMatchObject({ r2: 20, scaleY: 0.5 });
    expect(at('farthest-side at 20 10')).toMatchObject({ r2: 80, scaleY: 0.5 });
    expect(at('closest-corner at 20 10').r2).toBeCloseTo(Math.SQRT2 * 20, 6);
    expect(at('closest-corner at 20 10').scaleY).toBeCloseTo(0.5, 9);
    expect(at('at right bottom')).toMatchObject({ cx: 136, cy: 86 });
  });

  it('keeps a degenerate ellipse drawable', () => {
    const gradient = radial({
      'background-image': 'radial-gradient(closest-side at 0 25, red, blue)',
    });
    expect(gradient.r2).toBeGreaterThan(0);
    expect(Number.isFinite(gradient.scaleY)).toBe(true);
    expect(gradient.scaleY).toBeGreaterThan(0);
  });

  it('starts a radial gradient at its first stop and cuts stops before the center', () => {
    const ring = radial({ 'background-image': 'radial-gradient(circle, red 10px, blue 20px)' });
    expect(ring).toMatchObject({ r1: 10, r2: 20 });
    const cut = radial({
      'background-image': 'radial-gradient(circle closest-side, red -10px, blue 10px)',
    });
    expect(cut).toMatchObject({ r1: 0, r2: 10 });
    expect(cut.stops).toEqual([
      { offset: 0, color: '#800080', opacity: 1 },
      { offset: 1, ...BLUE },
    ]);
    const gone = radial({ 'background-image': 'radial-gradient(red -20px, blue -10px)' });
    expect(gone).toMatchObject({ r1: 0, r2: 1 });
    expect(gone.stops.map((stop) => stop.color)).toEqual(['#0000ff', '#0000ff']);
  });

  it('keeps one gradient for the whole height of a view split across sheets', () => {
    const rows = [0, 1, 2].map(() => el('pdf-view', { height: '300' }));
    const style = { 'background-image': 'linear-gradient(red, blue)' };
    const pages = layout(page([el('pdf-view', style, rows)]));
    expect(pages).toHaveLength(2);
    const rects = pages.map((laid, index) => only(list(laid, index, 2), 'rect')[0]!);
    const [first, second] = rects as [Op<'rect'>, Op<'rect'>];
    const total = first.h + second.h;
    expect(first.gradient).toMatchObject({ y1: first.y });
    expect(second.gradient).toMatchObject({ y1: second.y - first.h });
    for (const rect of rects) {
      if (rect.gradient?.kind !== 'linear') throw new Error('expected a linear gradient');
      expect(rect.gradient.y2 - rect.gradient.y1).toBeCloseTo(total, 6);
    }
  });

  it('spans the whole box when a unit taller than the page is cut', () => {
    const view = el('pdf-view', {
      height: '1000',
      'flex-direction': 'row',
      'background-image': 'linear-gradient(red, blue)',
    });
    const [rect] = only(list(layout(page([view]))[0]!, 0, 1), 'rect');
    expect(rect!.h).toBeLessThan(1000);
    expect(rect!.gradient).toMatchObject({ y1: 36, y2: 1036 });
  });
});
