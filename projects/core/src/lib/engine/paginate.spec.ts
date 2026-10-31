import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Yoga } from 'yoga-layout/load';
import { createNode, type PdfNode } from '../tree/node';
import type { LayoutContext } from './layout';
import { pageSize, paginatePage, type PageLayout, type PlacedBox } from './paginate';
import { resolveStyles } from './style';
import { createPdfkitWriter, type PdfWriter } from './writer';

let yoga: Yoga;
let writer: PdfWriter;
beforeAll(async () => {
  const { loadYoga } = await import('yoga-layout/load');
  yoga = await loadYoga();
  writer = await createPdfkitWriter({ compress: false });
});

const A4_HEIGHT = 841.89;
const PADDING = 36;
const NUMBER_HEIGHT = 9;
const CONTENT_TOP = PADDING;
const CONTENT_BOTTOM = A4_HEIGHT - PADDING - NUMBER_HEIGHT;

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

function row(height = 20, header = false): PdfNode {
  return el('pdf-row', { height: String(height) }, [el('pdf-cell')], { header });
}

function table(bodyRows: number, withHeader = true, style: Record<string, string> = {}): PdfNode {
  const rows = Array.from({ length: bodyRows }, () => row());
  return el('pdf-table', style, withHeader ? [row(20, true), ...rows] : rows, {
    columns: ['1fr'],
  });
}

function pageNumber(style: Record<string, string> = { height: String(NUMBER_HEIGHT) }): PdfNode {
  return el('pdf-page-number', style, [], { format: '{page} / {total}' });
}

function page(
  children: PdfNode[],
  style: Record<string, string> = { padding: String(PADDING) },
  props: Record<string, unknown> = { size: 'A4', orientation: 'portrait' },
): PdfNode {
  return el('pdf-page', style, children, props);
}

function paginate(root: PdfNode, warn = vi.fn<(message: string) => void>()): PageLayout[] {
  const ctx: LayoutContext = { yoga, metrics: writer, images: new Map(), warn };
  return paginatePage(root, resolveStyles(root), ctx);
}

function bottom(placed: PlacedBox): number {
  return placed.y + placed.box.h;
}

function isHeader(node: PdfNode): boolean {
  return node.owner?.pdfProps()['header'] === true;
}

describe('paginatePage: tables', () => {
  // 760.89pt of content below the header row's 20pt leaves room for 37 rows of 20pt.
  const ROWS_PER_PAGE = Math.floor((CONTENT_BOTTOM - CONTENT_TOP - 20) / 20);

  function checkTable(pages: PageLayout[], rows: number): void {
    expect(ROWS_PER_PAGE).toBe(37);
    expect(pages).toHaveLength(Math.ceil(rows / ROWS_PER_PAGE));
    const body: PdfNode[] = [];
    for (const [index, laid] of pages.entries()) {
      expect(laid.width).toBe(595.28);
      expect(laid.height).toBe(A4_HEIGHT);
      expect(isHeader(laid.placed[0]!.box.node)).toBe(true);
      expect(laid.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
      expect(laid.placed.filter((p) => isHeader(p.box.node))).toHaveLength(1);
      for (const placed of laid.placed) {
        expect(bottom(placed)).toBeLessThanOrEqual(CONTENT_BOTTOM + 1e-6);
        expect(placed.clipBottom).toBeUndefined();
        expect(placed.x).toBeCloseTo(PADDING, 6);
        if (!isHeader(placed.box.node)) body.push(placed.box.node);
      }
      const expected = Math.min(ROWS_PER_PAGE, rows - index * ROWS_PER_PAGE);
      expect(laid.placed).toHaveLength(expected + 1);
      // Rows follow each other with no gap, right below the header.
      laid.placed.forEach((placed, i) => {
        expect(placed.y).toBeCloseTo(CONTENT_TOP + 20 * i, 6);
      });
    }
    expect(new Set(body).size).toBe(rows);
  }

  it('repeats the header on every page and keeps rows above the page number', () => {
    const root = page([table(140), pageNumber()]);
    const pages = paginate(root);
    checkTable(pages, 140);
    const rows = root.children[0]!.children.slice(1);
    expect(pages.flatMap((p) => p.placed.slice(1).map((placed) => placed.box.node))).toEqual(rows);
  });

  it('paginates a table inside a column pdf-view the same way', () => {
    const plain = paginate(page([table(140), pageNumber()]));
    const wrapped = paginate(page([el('pdf-view', {}, [table(140)]), pageNumber()]));
    checkTable(wrapped, 140);
    expect(wrapped.map((p) => p.placed.map((placed) => placed.y))).toEqual(
      plain.map((p) => p.placed.map((placed) => placed.y)),
    );
  });

  it('places a header-only table once on one page', () => {
    const header = row(20, true);
    const root = page([el('pdf-table', {}, [header], { columns: ['1fr'] }), pageNumber()]);
    const pages = paginate(root);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.placed.map((p) => p.box.node)).toEqual([header]);
    expect(pages[0]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
  });

  it('moves the header with its first row when the two do not fit', () => {
    // 740pt of filler leaves 20.89pt: room for the header but not for header plus row.
    const filler = el('pdf-view', { height: '740' });
    const pages = paginate(page([filler, table(2), pageNumber()]));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.placed.map((p) => p.box.node)).toEqual([filler]);
    expect(pages[1]!.placed).toHaveLength(3);
    expect(isHeader(pages[1]!.placed[0]!.box.node)).toBe(true);
  });

  it('keeps the table gap between a repeated header and the first row', () => {
    const pages = paginate(page([table(60, true, { gap: '4' }), pageNumber()]));
    expect(pages.length).toBeGreaterThan(1);
    for (const laid of pages) {
      const [header, first] = laid.placed;
      expect(first!.y - bottom(header!)).toBeCloseTo(4, 6);
    }
  });

  it('starts the header where the table starts, after its border and padding', () => {
    const pages = paginate(
      page([table(3, true, { 'border-width': '2', padding: '3' }), pageNumber()]),
    );
    expect(pages[0]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP + 5, 6);
  });

  it('places rows that come before the header after it', () => {
    const first = row();
    const header = row(20, true);
    const root = page([el('pdf-table', {}, [first, header], { columns: ['1fr'] })]);
    const placed = paginate(root)[0]!.placed;
    expect(placed.map((p) => p.box.node)).toEqual([header, first]);
    expect(placed[1]!.y).toBeCloseTo(CONTENT_TOP + 20, 6);
  });

  it('places a header taller than the content area once and paginates the rows without it', () => {
    const header = row(900, true);
    const rows = Array.from({ length: 50 }, () => row());
    const warn = vi.fn<(message: string) => void>();
    const root = page([el('pdf-table', {}, [header, ...rows], { columns: ['1fr'] }), pageNumber()]);
    const pages = paginate(root, warn);
    expect(pages[0]!.placed).toHaveLength(1);
    expect(pages[0]!.placed[0]!.box.node).toBe(header);
    expect(pages[0]!.placed[0]!.clipBottom).toBeCloseTo(CONTENT_BOTTOM, 6);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: pdf-row header is taller than a page and is cut at the bottom',
    );
    const placed = pages.slice(1).flatMap((p) => p.placed);
    expect(placed.map((p) => p.box.node)).toEqual(rows);
    expect(placed.every((p) => p.clipBottom === undefined)).toBe(true);
  });

  it('drops the header on a page whose row fits only without it', () => {
    const header = row(100, true);
    const rows = [row(700), row(700)];
    const warn = vi.fn<(message: string) => void>();
    const root = page([el('pdf-table', {}, [header, ...rows], { columns: ['1fr'] }), pageNumber()]);
    const pages = paginate(root, warn);
    expect(pages.map((p) => p.placed.map((placed) => placed.box.node))).toEqual([
      [rows[0]],
      [rows[1]],
    ]);
    expect(pages[1]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
    expect(warn).not.toHaveBeenCalled();
  });

  it('sends layout and pagination warnings to the same ctx.warn', () => {
    const table = el(
      'pdf-table',
      {},
      [el('pdf-row', { 'padding-left': '4', height: '20' }, [el('pdf-cell')])],
      { columns: ['1fr'] },
    );
    const tall = el('pdf-view', { height: '2000', 'flex-direction': 'row' });
    const warn = vi.fn<(message: string) => void>();
    paginate(page([table, tall]), warn);
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      'ngpdf: ignored inside tables: pdf-row padding-left',
      'ngpdf: pdf-view is taller than a page and is cut at the bottom',
    ]);
  });

  it('stacks several header rows as one header', () => {
    const rows = Array.from({ length: 80 }, () => row());
    const root = page([
      el('pdf-table', {}, [row(10, true), row(15, true), ...rows], { columns: ['1fr'] }),
    ]);
    const pages = paginate(root);
    expect(pages.length).toBeGreaterThan(1);
    for (const laid of pages) {
      expect(laid.placed[0]!.box.h).toBe(10);
      expect(laid.placed[1]!.box.h).toBe(15);
      expect(laid.placed[1]!.y).toBeCloseTo(CONTENT_TOP + 10, 6);
      expect(laid.placed[2]!.y).toBeCloseTo(CONTENT_TOP + 25, 6);
    }
  });
});

describe('paginatePage: break-inside: avoid on wrappers', () => {
  const AREA = CONTENT_BOTTOM - CONTENT_TOP;
  const filler = (room: number): PdfNode => el('pdf-view', { height: String(AREA - room) });
  const block = (): PdfNode => el('pdf-view', { height: '20' });
  const nodesOn = (pages: PageLayout[]): PdfNode[][] =>
    pages.map((laid) => laid.placed.map((p) => p.box.node));

  it('moves a column view that does not fit here but fits a page to the next page whole', () => {
    const first = filler(30);
    const items = [block(), block(), block()];
    const pages = paginate(page([first, el('pdf-view', { 'break-inside': 'avoid' }, items)]));
    expect(nodesOn(pages)).toEqual([[first], items]);
    expect(pages[1]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
  });

  it('leaves a column view without break-inside: avoid split across pages', () => {
    const items = [block(), block(), block()];
    const pages = paginate(page([filler(30), el('pdf-view', {}, items)]));
    expect(nodesOn(pages)[1]).toEqual(items.slice(1));
  });

  it('moves a table with a header whole, its header drawn once', () => {
    const first = filler(50);
    const tableNode = table(3, true, { 'break-inside': 'avoid' });
    const pages = paginate(page([first, tableNode]));
    expect(nodesOn(pages)).toEqual([[first], tableNode.children]);
  });

  it('splits a kept view taller than a page as before, without a warning', () => {
    const warn = vi.fn<(message: string) => void>();
    const first = filler(30);
    const items = Array.from({ length: 50 }, block);
    const pages = paginate(page([first, el('pdf-view', { 'break-inside': 'avoid' }, items)]), warn);
    expect(nodesOn(pages)[0]).toEqual([first, items[0]]);
    expect(nodesOn(pages).flat()).toEqual([first, ...items]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps an inner view whole when the outer kept view is too tall to keep', () => {
    const items = Array.from({ length: 36 }, block);
    const inner = [block(), block(), block()];
    const outer = el('pdf-view', { 'break-inside': 'avoid' }, [
      ...items,
      el('pdf-view', { 'break-inside': 'avoid' }, inner),
    ]);
    const pages = paginate(page([outer]));
    // 36 rows of 20pt leave 49.89pt, room for two of the three inner rows.
    expect(nodesOn(pages)).toEqual([items, inner]);
  });

  it('counts the bottom padding of the views closing with a kept view', () => {
    const items = [block(), block()];
    const kept = el('pdf-view', { 'break-inside': 'avoid' }, items);
    const first = filler(50);
    const pages = paginate(page([first, el('pdf-view', { 'padding-bottom': '20' }, [kept])]));
    expect(nodesOn(pages)).toEqual([[first], items]);
  });
});

describe('paginatePage: transform', () => {
  const AREA = CONTENT_BOTTOM - CONTENT_TOP;
  const block = (): PdfNode => el('pdf-view', { height: '20' });
  const nodesOn = (pages: PageLayout[]): PdfNode[][] =>
    pages.map((laid) => laid.placed.map((p) => p.box.node));

  it('places a transformed column view as one unit, moved whole to the next page', () => {
    const first = el('pdf-view', { height: String(AREA - 30) });
    const stamp = el('pdf-view', { transform: 'rotate(-10deg)', 'background-color': '#eee' }, [
      block(),
      block(),
      block(),
    ]);
    const pages = paginate(page([first, stamp]));
    expect(nodesOn(pages)).toEqual([[first], [stamp]]);
    expect(pages[1]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
    // Its background is drawn with the unit, not sliced as a wrapper's.
    expect(pages.flatMap((laid) => laid.decorations)).toEqual([]);
  });

  it('cuts a transformed view taller than a page at the bottom, with a warning', () => {
    const warn = vi.fn<(message: string) => void>();
    const stamp = el('pdf-view', { transform: 'scale(0.5)' }, Array.from({ length: 50 }, block));
    const pages = paginate(page([stamp, pageNumber()]), warn);
    expect(nodesOn(pages)).toEqual([[stamp]]);
    expect(pages[0]!.placed[0]!.clipBottom).toBeCloseTo(CONTENT_BOTTOM, 6);
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: pdf-view is taller than a page and is cut at the bottom',
    );
  });

  it('keeps a transformed pdf-text whole, as with break-inside: avoid', () => {
    const words = Array.from({ length: 10 }, (_, i) => `w${String(i)}`).join(' ');
    const paragraph = el('pdf-text', {
      width: '25',
      'font-size': '10',
      'line-height': '1',
      transform: 'rotate(5deg)',
    });
    const run = createNode('text', '', words);
    run.parent = paragraph;
    paragraph.children.push(run);
    const first = el('pdf-view', { height: String(AREA - 35) });
    const pages = paginate(page([first, paragraph]));
    expect(nodesOn(pages)).toEqual([[first], [paragraph]]);
    expect(pages[1]!.placed[0]!.box.text?.lines).toHaveLength(10);
  });

  it('keeps breaking a table with a transform between its rows', () => {
    const tableNode = table(60, false, { transform: 'rotate(90deg)' });
    const pages = paginate(page([tableNode]));
    expect(pages).toHaveLength(2);
    expect(nodesOn(pages).flat()).toEqual(tableNode.children);
  });
});

describe('paginatePage: overflow: hidden', () => {
  const AREA = CONTENT_BOTTOM - CONTENT_TOP;
  const block = (): PdfNode => el('pdf-view', { height: '20' });
  const nodesOn = (pages: PageLayout[]): PdfNode[][] =>
    pages.map((laid) => laid.placed.map((p) => p.box.node));

  it('places a clipping column view as one unit, moved whole to the next page', () => {
    const first = el('pdf-view', { height: String(AREA - 30) });
    const card = el('pdf-view', { overflow: 'hidden' }, [block(), block(), block()]);
    const pages = paginate(page([first, card]));
    expect(nodesOn(pages)).toEqual([[first], [card]]);
    expect(pages[1]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
    expect(pages.flatMap((laid) => laid.decorations)).toEqual([]);
  });

  it('cuts a clipping view taller than a page at the bottom, with a warning', () => {
    const warn = vi.fn<(message: string) => void>();
    const items = Array.from({ length: 50 }, block);
    const card = el('pdf-view', { overflow: 'hidden' }, items);
    const pages = paginate(page([card, pageNumber()]), warn);
    expect(nodesOn(pages)).toEqual([[card]]);
    expect(pages[0]!.placed[0]!.clipBottom).toBeCloseTo(CONTENT_BOTTOM, 6);
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: pdf-view is taller than a page and is cut at the bottom',
    );
  });

  it('breaks before and after a clipping view when an element inside asks for it', () => {
    const before = block();
    const inner = el('pdf-view', { height: '20' }, [], { breakBefore: true, breakAfter: true });
    const card = el('pdf-view', { overflow: 'hidden' }, [block(), inner]);
    const after = block();
    expect(nodesOn(paginate(page([before, card, after])))).toEqual([[before], [card], [after]]);
  });

  it('keeps paginating a table with overflow: hidden by rows', () => {
    const tableNode = table(60, false, { overflow: 'hidden' });
    const pages = paginate(page([tableNode]));
    expect(pages).toHaveLength(2);
    expect(nodesOn(pages).flat()).toEqual(tableNode.children);
  });
});

describe('paginatePage: break-after: avoid', () => {
  // Without a page number, the content area is the page height less the padding.
  const AREA = A4_HEIGHT - 2 * PADDING;
  const filler = (room: number): PdfNode => el('pdf-view', { height: String(AREA - room) });
  const block = (height = 20, style: Record<string, string> = {}): PdfNode =>
    el('pdf-view', { height: String(height), ...style });
  const avoid = { 'break-after': 'avoid' };
  const nodesOn = (pages: PageLayout[]): PdfNode[][] =>
    pages.map((laid) => laid.placed.map((p) => p.box.node));

  /** A text of `lines` lines, one word per line, each 10pt high. */
  function paragraph(lines: number, style: Record<string, string> = {}): PdfNode {
    const words = Array.from({ length: lines }, (_, i) => `w${String(i)}`).join(' ');
    const node = el('pdf-text', { width: '25', 'font-size': '10', 'line-height': '1', ...style });
    const run = createNode('text', '', words);
    run.parent = node;
    node.children.push(run);
    return node;
  }

  it('moves a unit to the next page with the one after it when that one does not fit', () => {
    const first = filler(30);
    const [heading, body] = [block(20, avoid), block()];
    expect(nodesOn(paginate(page([first, heading, body])))).toEqual([[first], [heading, body]]);
  });

  it('leaves the unit where it is without avoid, or when the next one fits too', () => {
    const first = filler(30);
    const [heading, body] = [block(), block()];
    expect(nodesOn(paginate(page([first, heading, body])))).toEqual([[first, heading], [body]]);
    const roomy = filler(45);
    const [kept, small] = [block(20, avoid), block()];
    expect(nodesOn(paginate(page([roomy, kept, small])))).toEqual([[roomy, kept, small]]);
  });

  it('needs only the first line group of a split text after it to fit', () => {
    const tight = filler(35);
    const [heading, text] = [block(20, avoid), paragraph(10)];
    const moved = paginate(page([tight, heading, text]));
    expect(moved[0]!.placed.map((p) => p.box.node)).toEqual([tight]);
    expect(moved[1]!.placed[0]!.box.node).toBe(heading);
    const roomy = filler(45);
    const [stays, after] = [block(20, avoid), paragraph(10)];
    const kept = paginate(page([roomy, stays, after]));
    // 25pt left after the heading: the first two lines.
    expect(kept[0]!.placed.map((p) => p.box.node)).toEqual([roomy, stays, after]);
  });

  it('counts the header of a table after it', () => {
    const tight = filler(50);
    const [heading, rows] = [block(20, avoid), table(3)];
    expect(paginate(page([tight, heading, rows]))[0]!.placed.map((p) => p.box.node)).toEqual([
      tight,
    ]);
    const roomy = filler(65);
    const [stays, more] = [block(20, avoid), table(3)];
    const pages = paginate(page([roomy, stays, more]));
    expect(pages[0]!.placed.map((p) => p.box.node).slice(0, 2)).toEqual([roomy, stays]);
  });

  it('counts the repeated header when joined rows would move to the next page', () => {
    const header = row(20, true);
    const first = row();
    // Joined, the two rows fit a page only without the header that repeats above them.
    const joinedRow = el('pdf-row', { height: String(AREA - 50), 'break-after': 'avoid' }, [
      el('pdf-cell'),
    ]);
    const last = row(40);
    const root = page([
      el('pdf-table', {}, [header, first, joinedRow, last], { columns: ['1fr'] }),
    ]);
    expect(nodesOn(paginate(root))).toEqual([
      [header, first, joinedRow],
      [header, last],
    ]);
  });

  it('counts the header once when joined rows start at the first body row', () => {
    const first = el('pdf-view', { height: '30' });
    const header = row(20, true);
    // Header and both rows fit a page with 1pt to spare; counting the header twice would not.
    const joinedRow = el('pdf-row', { height: String(AREA - 61), 'break-after': 'avoid' }, [
      el('pdf-cell'),
    ]);
    const last = row(40);
    const table = el('pdf-table', {}, [header, joinedRow, last], { columns: ['1fr'] });
    expect(nodesOn(paginate(page([first, table])))).toEqual([[first], [header, joinedRow, last]]);
  });

  it('moves a chain of units joined by avoid with the first unit after them', () => {
    const first = filler(45);
    const [h1, h2, body] = [block(20, avoid), block(20, avoid), block()];
    expect(nodesOn(paginate(page([first, h1, h2, body])))).toEqual([[first], [h1, h2, body]]);
  });

  it('ignores a chain taller than a page', () => {
    const [first, tall, body] = [block(10), block(AREA - 30, avoid), block(40)];
    expect(nodesOn(paginate(page([first, tall, body])))).toEqual([[first, tall], [body]]);
  });

  it('gives way to a page break between the units', () => {
    const first = filler(30);
    const [heading, body] = [block(20, avoid), block(20, { 'break-before': 'page' })];
    expect(nodesOn(paginate(page([first, heading, body])))).toEqual([[first, heading], [body]]);
  });

  it('never moves a unit at the top of a page', () => {
    const [heading, body] = [block(AREA - 10, avoid), block()];
    expect(nodesOn(paginate(page([heading, body])))).toEqual([[heading], [body]]);
  });

  it('keeps the last unit of a wrapper with what follows the wrapper', () => {
    const first = filler(50);
    const [a, b, c] = [block(), block(), block()];
    const pages = paginate(page([first, el('pdf-view', avoid, [a, b]), c]));
    expect(nodesOn(pages)).toEqual([
      [first, a],
      [b, c],
    ]);
  });

  it('keeps the last line group of a split text with what follows it', () => {
    // The whole text fits in the 45pt left, but not with the 20pt block after it.
    const first = filler(45);
    const [text, body] = [paragraph(4, avoid), block()];
    const pages = paginate(page([first, text, body]));
    const lines = (laid: PageLayout) =>
      laid.placed.flatMap((p) => p.box.text?.lines.map((line) => line.text) ?? []);
    expect(lines(pages[0]!)).toEqual(['w0', 'w1']);
    expect(lines(pages[1]!)).toEqual(['w2', 'w3']);
    expect(pages[1]!.placed.at(-1)!.box.node).toBe(body);
  });

  it('keeps a whole row with the next one when one of its cells asks for it', () => {
    const first = filler(30);
    const asking = el('pdf-row', { height: '20' }, [el('pdf-cell', avoid)]);
    const next = row();
    const rows = el('pdf-table', {}, [asking, next], { columns: ['1fr'] });
    expect(nodesOn(paginate(page([first, rows])))).toEqual([[first], [asking, next]]);
  });

  it('counts a kept wrapper after it with its whole height', () => {
    const first = filler(50);
    const heading = block(20, avoid);
    const items = [block(), block()];
    const pages = paginate(
      page([first, heading, el('pdf-view', { 'break-inside': 'avoid' }, items)]),
    );
    expect(nodesOn(pages)).toEqual([[first], [heading, ...items]]);
  });
});

describe('paginatePage: page breaks', () => {
  it('starts a new page at breakBefore', () => {
    const first = el('pdf-view', { height: '20' });
    const second = el('pdf-view', { height: '20', 'break-before': 'page' });
    const pages = paginate(page([first, second]));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.placed.map((p) => p.box.node)).toEqual([first]);
    expect(pages[1]!.placed.map((p) => p.box.node)).toEqual([second]);
    expect(pages[1]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
  });

  it('takes breakBefore from the element prop as well', () => {
    const second = el('pdf-view', { height: '20' }, [], { breakBefore: true });
    const pages = paginate(page([el('pdf-view', { height: '20' }), second]));
    expect(pages[1]!.placed[0]!.box.node).toBe(second);
  });

  it('adds no empty page for breakBefore on the first unit', () => {
    const pages = paginate(page([el('pdf-view', { height: '20', 'break-before': 'page' })]));
    expect(pages).toHaveLength(1);
  });

  it('breaks before a wrapper that asks for it', () => {
    const inner = el('pdf-view', { height: '20' });
    const wrapper = el('pdf-view', { 'break-before': 'page' }, [inner]);
    const pages = paginate(page([el('pdf-view', { height: '20' }), wrapper]));
    expect(pages[1]!.placed.map((p) => p.box.node)).toEqual([inner]);
  });

  it('breaks before a table row whose cell asks for it', () => {
    const second = el('pdf-row', { height: '20' }, [el('pdf-cell', { 'break-before': 'page' })]);
    const tableNode = el('pdf-table', {}, [row(), second], { columns: ['1fr'] });
    const pages = paginate(page([tableNode]));
    expect(pages).toHaveLength(2);
    expect(pages[1]!.placed.map((p) => p.box.node)).toEqual([second]);
  });

  it('breaks before a row view when an element deep inside it asks for it', () => {
    const text = el('pdf-text', {}, [], { breakBefore: true });
    const rowView = el('pdf-view', { 'flex-direction': 'row', height: '20' }, [
      el('pdf-view', {}, [text]),
    ]);
    const pages = paginate(page([el('pdf-view', { height: '20' }), rowView]));
    expect(pages).toHaveLength(2);
    expect(pages[1]!.placed.map((p) => p.box.node)).toEqual([rowView]);
  });

  it('ignores a break asked for inside a repeated header row', () => {
    const header = el('pdf-row', { height: '20' }, [el('pdf-cell', { 'break-before': 'page' })], {
      header: true,
    });
    const tableNode = el('pdf-table', {}, [header, row()], { columns: ['1fr'] });
    const pages = paginate(page([el('pdf-view', { height: '20' }), tableNode]));
    expect(pages).toHaveLength(1);
  });

  it('starts a new page after break-after: page', () => {
    const first = el('pdf-view', { height: '20', 'break-after': 'page' });
    const second = el('pdf-view', { height: '20' });
    const pages = paginate(page([first, second]));
    expect(pages.map((laid) => laid.placed.map((p) => p.box.node))).toEqual([[first], [second]]);
    expect(pages[1]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
  });

  it('takes breakAfter from the element prop as well', () => {
    const first = el('pdf-view', { height: '20' }, [], { breakAfter: true });
    const pages = paginate(page([first, el('pdf-view', { height: '20' })]));
    expect(pages).toHaveLength(2);
  });

  it('adds no empty page for break-after on the last unit', () => {
    const last = el('pdf-view', { height: '20', 'break-after': 'page' });
    const pages = paginate(page([el('pdf-view', { height: '20' }), last]));
    expect(pages).toHaveLength(1);
  });

  it('ignores break-after keywords other than page and avoid', () => {
    const first = el('pdf-view', { height: '20', 'break-after': 'column' });
    expect(paginate(page([first, el('pdf-view', { height: '20' })]))).toHaveLength(1);
  });

  it('breaks after the last unit of a wrapper that asks for it', () => {
    const [a, b, c] = [1, 2, 3].map(() => el('pdf-view', { height: '20' }));
    const wrapper = el('pdf-view', { 'break-after': 'page' }, [a!, b!]);
    const pages = paginate(page([wrapper, c!]));
    expect(pages.map((laid) => laid.placed.map((p) => p.box.node))).toEqual([[a, b], [c]]);
  });

  it('breaks after a table row whose cell asks for it', () => {
    const first = el('pdf-row', { height: '20' }, [el('pdf-cell', { 'break-after': 'page' })]);
    const second = row();
    const pages = paginate(page([el('pdf-table', {}, [first, second], { columns: ['1fr'] })]));
    expect(pages.map((laid) => laid.placed.map((p) => p.box.node))).toEqual([[first], [second]]);
  });

  it('puts a unit taller than a page on its own page, clipped, with one warning', () => {
    const before = el('pdf-view', { height: '20' });
    const tall = el('pdf-view', { 'flex-direction': 'row', height: '2000' }, [
      el('pdf-view', { height: '2000', width: '50' }),
    ]);
    const after = el('pdf-view', { height: '20' });
    const warn = vi.fn<(message: string) => void>();
    const pages = paginate(page([before, tall, after, pageNumber()]), warn);
    expect(pages).toHaveLength(3);
    expect(pages[1]!.placed).toHaveLength(1);
    const placed = pages[1]!.placed[0]!;
    expect(placed.box.node).toBe(tall);
    expect(placed.y).toBeCloseTo(CONTENT_TOP, 6);
    expect(placed.clipBottom).toBeCloseTo(CONTENT_BOTTOM, 6);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: pdf-view is taller than a page and is cut at the bottom',
    );
    expect(pages[2]!.placed[0]!.box.node).toBe(after);
    expect(pages[0]!.placed[0]!.clipBottom).toBeUndefined();
  });

  it('keeps the vertical offsets between units from the full layout', () => {
    const a = el('pdf-view', { height: '20', 'margin-top': '7' });
    const b = el('pdf-view', { height: '20', 'margin-top': '5' });
    const wrapper = el('pdf-view', { gap: '3' }, [a, b]);
    const placed = paginate(page([wrapper]))[0]!.placed;
    expect(placed[0]!.y).toBeCloseTo(CONTENT_TOP + 7, 6);
    expect(placed[1]!.y).toBeCloseTo(CONTENT_TOP + 7 + 20 + 3 + 5, 6);
  });

  it('starts a unit moved to a new page at the content top', () => {
    const units = Array.from({ length: 40 }, () =>
      el('pdf-view', { height: '20', 'margin-top': '10' }),
    );
    const pages = paginate(page(units));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP + 10, 6);
    expect(pages[1]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
  });

  it('treats a row pdf-view as one unit and recurses into column ones', () => {
    const cells = [el('pdf-text'), el('pdf-text')];
    const rowView = el('pdf-view', { 'flex-direction': 'row' }, cells);
    const column = el('pdf-view', {}, [el('pdf-view', { height: '5' }), rowView]);
    const placed = paginate(page([column]))[0]!.placed;
    expect(placed.map((p) => p.box.node)).toEqual([column.children[0], rowView]);
  });

  it('keeps an empty column pdf-view as a unit', () => {
    const spacer = el('pdf-view', { height: '30', 'background-color': '#eee' });
    const placed = paginate(page([spacer]))[0]!.placed;
    expect(placed.map((p) => p.box.node)).toEqual([spacer]);
  });

  it('places the whole content as one unit when the page is a row', () => {
    const a = el('pdf-view', { width: '50', height: '20' });
    const b = el('pdf-view', { width: '50', height: '30' });
    const pages = paginate(page([a, b], { padding: '36', 'flex-direction': 'row' }));
    expect(pages[0]!.placed).toHaveLength(1);
    const unit = pages[0]!.placed[0]!;
    expect(unit.box.children.map((c) => c.node)).toEqual([a, b]);
    expect([unit.x, unit.y, unit.box.h]).toEqual([36, 36, 30]);
    // Yoga keeps sizes as float32.
    expect(unit.box.w).toBeCloseTo(595.28 - 72, 3);
    expect(unit.box.style.backgroundColor).toBeNull();
  });

  it('produces one page when there are no units', () => {
    const pages = paginate(page([pageNumber()]));
    expect(pages).toHaveLength(1);
    expect(pages[0]!.placed).toEqual([]);
    expect(pages[0]!.pageNumber).toBeDefined();
  });

  it('moves a unit whose closing wrapper does not fit', () => {
    // The last 20pt unit fits at 765.89, but the wrapper's 10pt bottom padding would not.
    const filler = el('pdf-view', { height: '740' });
    const last = el('pdf-view', { height: '20' });
    const wrapper = el('pdf-view', { 'padding-bottom': '10' }, [last]);
    const pages = paginate(page([filler, wrapper, pageNumber()]));
    expect(pages[1]!.placed.map((p) => p.box.node)).toEqual([last]);
  });
});

describe('paginatePage: page number', () => {
  it('reserves its height and sits at the bottom right of the content area', () => {
    const number = pageNumber();
    const pages = paginate(page([el('pdf-view', { height: '20' }), number]));
    const placed = pages[0]!.pageNumber!;
    expect(placed.box.node).toBe(number);
    expect(placed.x).toBeCloseTo(PADDING, 6);
    expect(placed.y).toBeCloseTo(CONTENT_BOTTOM, 6);
    expect(placed.box.w).toBeCloseTo(595.28 - 72, 3);
    expect(placed.box.h).toBe(NUMBER_HEIGHT);
    expect(placed.box.style.textAlign).toBe('right');
    // It is not laid out with the content, so it adds no offset to it.
    expect(pages[0]!.placed).toHaveLength(1);
  });

  it('is one line of its font high when no height is set', () => {
    const pages = paginate(page([pageNumber({ 'font-size': '10', 'padding-top': '4' })]));
    expect(pages[0]!.pageNumber!.box.h).toBeCloseTo(4 + 12, 6);
  });

  it('keeps an explicit text-align', () => {
    const pages = paginate(page([pageNumber({ 'text-align': 'center' })]));
    expect(pages[0]!.pageNumber!.box.style.textAlign).toBe('center');
  });

  it('keeps a text-align inherited from the page', () => {
    const pages = paginate(page([pageNumber()], { padding: '36', 'text-align': 'center' }));
    expect(pages[0]!.pageNumber!.box.style.textAlign).toBe('center');
  });

  it('leaves a pdf-page-number below a direct child in the flow, without a warning', () => {
    const nested = pageNumber();
    const warn = vi.fn<(message: string) => void>();
    const pages = paginate(page([el('pdf-view', {}, [el('pdf-view', {}, [nested])])]), warn);
    expect(warn).not.toHaveBeenCalled();
    expect(pages[0]!.pageNumber).toBeUndefined();
    expect(pages[0]!.placed).toHaveLength(1);
  });

  it('is the same on every page', () => {
    const pages = paginate(page([table(100), pageNumber()]));
    expect(pages.length).toBeGreaterThan(1);
    expect(new Set(pages.map((p) => p.pageNumber))).toHaveProperty('size', 1);
  });

  it('is absent when the page has none', () => {
    expect(paginate(page([]))[0]!.pageNumber).toBeUndefined();
  });
});

describe('paginatePage: decorations', () => {
  it('slices a wrapper background into one piece per page', () => {
    const children = Array.from({ length: 50 }, () => el('pdf-view', { height: '20' }));
    const wrapper = el(
      'pdf-view',
      { 'background-color': '#eee', padding: '10', gap: '5', 'border-width': '1' },
      children,
    );
    const pages = paginate(page([wrapper, pageNumber()]));
    expect(pages).toHaveLength(2);
    const pieces = pages.map((p) => p.decorations);
    expect(pieces.map((d) => d.length)).toEqual([1, 1]);
    const [first, second] = [pieces[0]![0]!, pieces[1]![0]!];
    const fullHeight = 11 + 50 * 20 + 49 * 5 + 11;
    // The gap between the last child on page 1 and the first on page 2 is cut.
    expect(first.box.h + second.box.h).toBeCloseTo(fullHeight - 5, 6);
    expect(first.box.node).toBe(wrapper);
    expect(first.box.children).toEqual([]);
    expect([first.x, first.y]).toEqual([PADDING, CONTENT_TOP]);
    expect(first.sliceTop).toBe(false);
    expect(first.sliceBottom).toBe(true);
    expect(second.y).toBeCloseTo(CONTENT_TOP, 6);
    expect(second.sliceTop).toBe(true);
    expect(second.sliceBottom).toBe(false);
    // Page 1's piece ends at its last child, page 2's at the wrapper's padding and border.
    expect(first.y + first.box.h).toBeCloseTo(bottom(pages[0]!.placed.at(-1)!), 6);
    expect(second.y + second.box.h).toBeCloseTo(bottom(pages[1]!.placed.at(-1)!) + 11, 6);
  });

  it('extends a sliced outer piece below the inner wrappers that close on its page', () => {
    const cards = Array.from({ length: 12 }, () =>
      el('pdf-view', { padding: '10', 'border-width': '2', 'background-color': '#ddd' }, [
        el('pdf-view', { height: '80' }),
      ]),
    );
    const section = el('pdf-view', { 'background-color': '#eee', gap: '6' }, cards);
    const pages = paginate(page([section, pageNumber()]));
    expect(pages.length).toBeGreaterThan(1);
    const [outer, ...inner] = pages[0]!.decorations;
    expect(outer!.box.node).toBe(section);
    expect(outer!.sliceBottom).toBe(true);
    expect(inner.length).toBeGreaterThan(0);
    for (const piece of inner) {
      expect(outer!.y + outer!.box.h).toBeGreaterThanOrEqual(piece.y + piece.box.h - 1e-6);
    }
    // Page 1 ends with a whole card, so the section piece ends at its bottom border.
    const lastCard = inner.at(-1)!;
    expect(lastCard.sliceBottom).toBe(false);
    expect(outer!.y + outer!.box.h).toBeCloseTo(lastCard.y + lastCard.box.h, 6);
  });

  it('keeps the padding of a wrapper that opens on a new page', () => {
    const inner = el('pdf-view', { height: '20' });
    const wrapper = el('pdf-view', { 'border-width': '2', padding: '8', 'margin-top': '50' }, [
      inner,
    ]);
    const pages = paginate(page([el('pdf-view', { height: '760' }), wrapper]));
    expect(pages).toHaveLength(2);
    expect(pages[1]!.decorations[0]!.y).toBeCloseTo(CONTENT_TOP, 6);
    expect(pages[1]!.placed[0]!.y).toBeCloseTo(CONTENT_TOP + 10, 6);
  });

  it('draws nothing for a wrapper with no background or border', () => {
    const pages = paginate(page([el('pdf-view', {}, [el('pdf-view', { height: '20' })])]));
    expect(pages[0]!.decorations).toEqual([]);
  });

  it('draws a table border on every page it runs onto', () => {
    const pages = paginate(page([table(100, true, { 'border-width': '1' })]));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((p) => p.decorations.length === 1)).toBe(true);
  });

  it('orders nested wrapper pieces outer first', () => {
    const inner = el('pdf-view', { 'background-color': '#ddd' }, [
      el('pdf-view', { height: '20' }),
    ]);
    const outer = el('pdf-view', { 'background-color': '#eee' }, [inner]);
    const decorations = paginate(page([outer]))[0]!.decorations;
    expect(decorations.map((d) => d.box.node)).toEqual([outer, inner]);
  });

  it('cuts a wrapper piece at the content bottom when its unit is clipped', () => {
    const wrapper = el('pdf-view', { 'background-color': '#eee' }, [
      el('pdf-view', { height: '2000', 'flex-direction': 'row' }),
    ]);
    const pages = paginate(page([wrapper, pageNumber()]));
    const piece = pages[0]!.decorations[0]!;
    expect(piece.y + piece.box.h).toBeCloseTo(CONTENT_BOTTOM, 6);
  });

  it('paints the page background under everything on every page', () => {
    const root = page([table(100)], { padding: '36', 'background-color': '#fafafa' });
    const pages = paginate(root);
    for (const laid of pages) {
      const first = laid.decorations[0]!;
      expect(first.box.node).toBe(root);
      expect([first.x, first.y, first.box.w, first.box.h]).toEqual([0, 0, 595.28, A4_HEIGHT]);
      expect(first.box.children).toEqual([]);
    }
  });
});

describe('page geometry', () => {
  it('swaps the size for landscape', () => {
    const pages = paginate(page([], {}, { size: 'A4', orientation: 'landscape' }));
    expect([pages[0]!.width, pages[0]!.height]).toEqual([A4_HEIGHT, 595.28]);
  });

  it('takes a [width, height] size and defaults to A4 portrait', () => {
    expect(pageSize(el('pdf-page', {}, [], { size: [300, 400] }))).toEqual({
      width: 300,
      height: 400,
    });
    expect(pageSize(el('pdf-page'))).toEqual({ width: 595.28, height: A4_HEIGHT });
    expect(pageSize(el('pdf-page', {}, [], { size: 'Letter' }))).toEqual({
      width: 612,
      height: 792,
    });
  });

  it('rejects an unknown or empty page size', () => {
    expect(() => pageSize(el('pdf-page', {}, [], { size: 'B5' }))).toThrow(
      'ngpdf: unknown page size "B5" on pdf-page',
    );
    expect(() => pageSize(el('pdf-page', {}, [], { size: [0, 400] }))).toThrow(
      'ngpdf: unknown page size "[0,400]" on pdf-page',
    );
  });

  it('resolves percent padding against the page width and insets by the border', () => {
    const unit = el('pdf-view', { height: '20' });
    const placed = paginate(page([unit], { padding: '10%', 'border-width': '2' }))[0]!.placed[0]!;
    expect(placed.x).toBeCloseTo(59.528 + 2, 6);
    expect(placed.y).toBeCloseTo(59.528 + 2, 6);
    expect(placed.box.w).toBeCloseTo(595.28 - 2 * 61.528, 3);
  });

  it('uses no padding when the page sets none', () => {
    const placed = paginate(page([el('pdf-view', { height: '20' })], {}))[0]!.placed[0]!;
    expect([placed.x, placed.y]).toEqual([0, 0]);
  });
});

describe('paginatePage: text split across pages', () => {
  // Without a page number, the content area is 769.89pt: 76 lines of 10pt and 9.89pt left over.
  const AREA = A4_HEIGHT - 2 * PADDING;
  const LINE = 10;

  /** A text of `lines` lines, one word per line, each 10pt high. */
  function paragraph(lines: number, style: Record<string, string> = {}): PdfNode {
    const words = Array.from({ length: lines }, (_, i) => `w${String(i)}`).join(' ');
    const node = el('pdf-text', { width: '25', 'font-size': '10', 'line-height': '1', ...style });
    const run = createNode('text', '', words);
    run.parent = node;
    node.children.push(run);
    return node;
  }

  /** A view that leaves `room` points of the content area below it. */
  const filler = (room: number): PdfNode => el('pdf-view', { height: String(AREA - room) });

  const textPieces = (laid: PageLayout): PlacedBox[] =>
    laid.placed.filter((placed) => placed.box.node.tag === 'pdf-text');
  const linesOn = (laid: PageLayout): string[] =>
    textPieces(laid).flatMap((placed) => placed.box.text?.lines.map((line) => line.text) ?? []);

  it('breaks a paragraph between lines, filling the page before the break', () => {
    const pages = paginate(page([filler(35), paragraph(10)]));
    expect(pages).toHaveLength(2);
    expect(linesOn(pages[0]!)).toEqual(['w0', 'w1', 'w2']);
    expect(linesOn(pages[1]!)).toEqual(['w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9']);
    expect(textPieces(pages[1]!)[0]!.y).toBeCloseTo(CONTENT_TOP, 3);
    const pieces = textPieces(pages[0]!);
    expect(pieces[0]!.y).toBeCloseTo(CONTENT_TOP + AREA - 35, 3);
    expect(bottom(pieces.at(-1)!)).toBeCloseTo(CONTENT_TOP + AREA - 5, 3);
  });

  it('keeps a text with overflow: hidden whole, with its padding, so one clip covers it', () => {
    const text = paragraph(10, { overflow: 'hidden', padding: '4' });
    const fits = paginate(page([text]));
    expect(textPieces(fits[0]!)).toHaveLength(1);
    expect(textPieces(fits[0]!)[0]!.box.padding.top).toBe(4);
    const first = filler(35);
    const moved = paginate(page([first, paragraph(10, { overflow: 'hidden', padding: '4' })]));
    expect(moved.map((laid) => textPieces(laid).length)).toEqual([0, 1]);
  });

  it('cuts a text with overflow: hidden taller than a page at the bottom, with a warning', () => {
    const warn = vi.fn<(message: string) => void>();
    const pages = paginate(page([paragraph(100, { overflow: 'hidden' })]), warn);
    expect(pages).toHaveLength(1);
    expect(textPieces(pages[0]!)).toHaveLength(1);
    expect(textPieces(pages[0]!)[0]!.clipBottom).toBeCloseTo(CONTENT_TOP + AREA, 3);
    expect(warn).toHaveBeenCalledWith(
      'ngpdf: pdf-text is taller than a page and is cut at the bottom',
    );
  });

  it('splits a text cut by max-lines between its kept lines only', () => {
    const pages = paginate(page([filler(35), paragraph(10, { 'max-lines': '6' })]));
    expect(pages).toHaveLength(2);
    expect(linesOn(pages[0]!)).toEqual(['w0', 'w1', 'w2']);
    expect(linesOn(pages[1]!)).toEqual(['w3', 'w4', 'w5…']);
  });

  it('leaves at least orphans lines at the bottom of a page', () => {
    const pages = paginate(page([filler(15), paragraph(10)]));
    expect(linesOn(pages[0]!)).toEqual([]);
    expect(linesOn(pages[1]!)).toHaveLength(10);
    const three = paginate(page([filler(25), paragraph(10, { orphans: '3' })]));
    expect(linesOn(three[0]!)).toEqual([]);
  });

  it('carries at least widows lines to the next page', () => {
    const pages = paginate(page([filler(45), paragraph(5)]));
    expect(linesOn(pages[0]!)).toEqual(['w0', 'w1', 'w2']);
    expect(linesOn(pages[1]!)).toEqual(['w3', 'w4']);
    const three = paginate(page([filler(45), paragraph(5, { widows: '3' })]));
    expect(linesOn(three[0]!)).toEqual(['w0', 'w1']);
  });

  it('moves a text with fewer than orphans + widows lines whole', () => {
    const pages = paginate(page([filler(25), paragraph(3)]));
    expect(linesOn(pages[0]!)).toEqual([]);
    expect(linesOn(pages[1]!)).toEqual(['w0', 'w1', 'w2']);
  });

  it('keeps a text whole with break-inside: avoid, a fixed height, or inside a row', () => {
    for (const text of [
      paragraph(10, { 'break-inside': 'avoid' }),
      paragraph(10, { height: '100' }),
      paragraph(10, { 'max-height': '200' }),
    ]) {
      const pages = paginate(page([filler(35), text]));
      expect(linesOn(pages[0]!)).toEqual([]);
      expect(linesOn(pages[1]!)).toHaveLength(10);
    }
    const inRow = el('pdf-view', { 'flex-direction': 'row' }, [paragraph(10)]);
    const pages = paginate(page([filler(35), inRow]));
    expect(pages[0]!.placed.map((placed) => placed.box.node.tag)).toEqual(['pdf-view']);
  });

  it('flows a text longer than a page over several pages without a warning', () => {
    const warn = vi.fn<(message: string) => void>();
    const pages = paginate(page([paragraph(200)]), warn);
    expect(pages.map((laid) => linesOn(laid).length)).toEqual([76, 76, 48]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('draws a text that fits exactly where it was laid out', () => {
    const pages = paginate(page([filler(200), paragraph(10)]));
    expect(pages).toHaveLength(1);
    const pieces = textPieces(pages[0]!);
    expect(pieces[0]!.y).toBeCloseTo(CONTENT_TOP + AREA - 200, 3);
    const ys = pieces.flatMap((placed) =>
      (placed.box.text?.lines ?? []).map((line) => placed.y + line.y),
    );
    ys.forEach((y, i) => {
      expect(y).toBeCloseTo(ys[0]! + i * LINE, 3);
    });
  });

  it('keeps padding and border with the first and last lines and slices the background', () => {
    const boxed = { padding: '4', 'border-top': '1 solid black', 'background-color': '#eee' };
    const pages = paginate(page([filler(47), paragraph(10, boxed)]));
    // 47pt of room: 1pt border, 4pt padding and 4 lines.
    expect(linesOn(pages[0]!)).toEqual(['w0', 'w1', 'w2', 'w3']);
    expect(textPieces(pages[0]!)[0]!.y).toBeCloseTo(CONTENT_TOP + AREA - 47 + 5, 3);
    expect(textPieces(pages[1]!)[0]!.y).toBeCloseTo(CONTENT_TOP, 3);
    const backgrounds = pages.map((laid) =>
      laid.decorations.filter((placed) => placed.box.node.tag === 'pdf-text'),
    );
    expect(backgrounds[0]).toHaveLength(1);
    expect(backgrounds[0]![0]).toMatchObject({ sliceTop: false, sliceBottom: true });
    expect(backgrounds[1]![0]).toMatchObject({ sliceTop: true, sliceBottom: false });
    expect(backgrounds[1]![0]!.box.h).toBeCloseTo(6 * LINE + 4, 3);
    // The pieces draw only text: the background and border belong to the sliced decoration.
    for (const piece of [...textPieces(pages[0]!), ...textPieces(pages[1]!)]) {
      expect(piece.box.style.backgroundColor).toBeNull();
      expect(piece.box.style.borderWidth.top).toBe(0);
    }
  });

  /** A text with one line per height: a one-letter pdf-span per line, too wide to share one. */
  function tallLines(heights: readonly number[], style: Record<string, string> = {}): PdfNode {
    const node = el('pdf-text', { width: '5', 'font-size': '10', 'line-height': '1', ...style });
    heights.forEach((height, i) => {
      if (i > 0) {
        const space = createNode('text', '', ' ');
        space.parent = node;
        node.children.push(space);
      }
      const letter = createNode('text', '', String.fromCharCode(97 + i));
      node.children.push(el('pdf-span', { 'font-size': String(height) }, [letter]));
      node.children.at(-1)!.parent = node;
    });
    return node;
  }

  const lineCounts = (pages: PageLayout[]): number[] => pages.map((laid) => linesOn(laid).length);
  const letters = (count: number): string[] =>
    Array.from({ length: count }, (_, i) => String.fromCharCode(97 + i));

  it('lays out one line per height in the tall-line texts below', () => {
    const heights = [10, 10, 390, 350, 400, 200, 200];
    const pages = paginate(page([tallLines(heights, { 'break-inside': 'avoid' })]));
    const lines = pages.flatMap((laid) => textPieces(laid)).flatMap((p) => p.box.text!.lines);
    expect(lines.map((line) => line.text)).toEqual(letters(7));
    expect(lines.map((line) => line.height)).toEqual(heights);
  });

  it('gives lines back to an earlier page so a middle page keeps orphans and widows', () => {
    const heights = [10, 10, 390, 350, 400, 200, 200];
    const pages = paginate(page([tallLines(heights)]));
    // Placing lines greedily would give 4, 1 and 2 lines.
    expect(lineCounts(pages)).toEqual([3, 2, 2]);
    expect(pages.flatMap(linesOn)).toEqual(letters(7));
  });

  it('keeps the larger of orphans and widows on a middle page with other limits', () => {
    const heights = [10, 10, 10, 500, 150, 300, 300, 300];
    const pages = paginate(page([tallLines(heights, { orphans: '3', widows: '1' })]));
    // Greedily: 5, 2 and 1 lines, with only 2 on the middle page.
    expect(lineCounts(pages)).toEqual([4, 3, 1]);
    expect(pages.flatMap(linesOn)).toEqual(letters(8));
  });

  it('moves a text to the next page when no break on this one keeps the limits', () => {
    const heights = [10, 10, 390, 350, 400, 200, 200];
    const pages = paginate(page([filler(400), tallLines(heights)]));
    // Only the first two lines fit under the filler, and no split of the rest keeps 2 lines a page.
    expect(lineCounts(pages)).toEqual([0, 3, 2, 2]);
    expect(pages.flatMap(linesOn)).toEqual(letters(7));
  });

  it('counts the bottom padding of a wrapper that closes with the text', () => {
    const heights = [10, 10, 300, 300, 300, 100, 100];
    const wrapper = el('pdf-view', { 'padding-bottom': '300' }, [tallLines(heights)]);
    const pages = paginate(page([wrapper]));
    // Without the padding the last two groups would share a page: 4 and 3 lines.
    expect(lineCounts(pages)).toEqual([3, 2, 2]);
    expect(pages.flatMap(linesOn)).toEqual(letters(7));
    for (const laid of pages) {
      for (const placed of textPieces(laid))
        expect(bottom(placed)).toBeLessThanOrEqual(CONTENT_BOTTOM);
    }
    // The padding under the last piece still fits on the last page.
    const last = textPieces(pages.at(-1)!).at(-1)!;
    expect(bottom(last) + 300).toBeLessThanOrEqual(CONTENT_BOTTOM + 1e-6);
  });

  it('counts the top padding of a wrapper that opens with a text moved to a new page', () => {
    const heights = [10, 10, 300, 300, 300, 100, 100];
    const wrapper = el('pdf-view', { 'padding-top': '200' }, [tallLines(heights)]);
    const pages = paginate(page([filler(10), wrapper]));
    // Without the padding the new page would take 4 lines and overflow by it.
    expect(lineCounts(pages)).toEqual([0, 3, 2, 2]);
    expect(pages.flatMap(linesOn)).toEqual(letters(7));
    // The first piece sits under the padding at the top of its new page.
    expect(textPieces(pages[1]!)[0]!.y).toBeCloseTo(CONTENT_TOP + 200, 6);
    for (const laid of pages) {
      for (const placed of textPieces(laid))
        expect(bottom(placed)).toBeLessThanOrEqual(CONTENT_BOTTOM);
    }
  });

  it('places a text under a repeated table header greedily, line by line', () => {
    const heights = [10, 10, 390, 350, 400, 200, 200];
    const pages = paginate(
      page([el('pdf-table', {}, [row(20, true), tallLines(heights)], { columns: ['1fr'] })]),
    );
    // Each page loses 20pt to the header, so the middle pages get one line each.
    expect(lineCounts(pages)).toEqual([3, 1, 1, 2]);
    expect(pages.flatMap(linesOn)).toEqual(letters(7));
    for (const laid of pages) {
      expect(laid.placed.filter((placed) => isHeader(placed.box.node))).toHaveLength(1);
    }
  });

  it('falls back to greedy placement when no break meets the limits', () => {
    const warn = vi.fn<(message: string) => void>();
    const pages = paginate(page([tallLines([10, 10, 700, 700, 700, 10, 10])]), warn);
    expect(lineCounts(pages)).toEqual([3, 1, 3]);
    expect(pages.flatMap(linesOn)).toEqual(letters(7));
    expect(warn).not.toHaveBeenCalled();
  });

  it('breaks after the last line of a split text with breakAfter, not between its lines', () => {
    const text = paragraph(10);
    text.owner = { pdfProps: () => ({ breakAfter: true }) };
    const next = el('pdf-view', { height: '20' });
    const pages = paginate(page([text, next]));
    expect(pages).toHaveLength(2);
    expect(linesOn(pages[0]!)).toHaveLength(10);
    expect(pages[1]!.placed.map((p) => p.box.node)).toEqual([next]);
  });

  it('starts a new page before a split text with breakBefore', () => {
    const text = paragraph(10);
    text.owner = { pdfProps: () => ({ breakBefore: true }) };
    const pages = paginate(page([el('pdf-view', { height: '10' }), text]));
    expect(linesOn(pages[0]!)).toEqual([]);
    expect(linesOn(pages[1]!)).toHaveLength(10);
  });
});

describe('paginatePage: fixed views', () => {
  const fixed = (where: 'top' | 'bottom', height: number, style: Record<string, string> = {}) =>
    el('pdf-view', { height: String(height), ...style }, [], { fixed: where });
  const block = (height: number): PdfNode => el('pdf-view', { height: String(height) });
  const fixedOn = (laid: PageLayout): PlacedBox[] =>
    laid.placed.filter((placed) => placed.box.node.owner?.pdfProps()['fixed'] !== undefined);
  const flowOn = (laid: PageLayout): PlacedBox[] =>
    laid.placed.filter((placed) => placed.box.node.owner?.pdfProps()['fixed'] === undefined);
  const AREA = A4_HEIGHT - 2 * PADDING;

  it('draws top and bottom views on every sheet and keeps the flow between them', () => {
    const blocks = Array.from({ length: 10 }, () => block(100));
    const pages = paginate(page([fixed('top', 40), ...blocks, fixed('bottom', 30)]));
    // 769.89 - 40 - 30 leaves room for six 100pt blocks a sheet.
    expect(pages.map((laid) => flowOn(laid).length)).toEqual([6, 4]);
    for (const laid of pages) {
      const [top, bottomView] = fixedOn(laid);
      expect(top!.y).toBeCloseTo(CONTENT_TOP, 3);
      expect(bottom(bottomView!)).toBeCloseTo(CONTENT_TOP + AREA, 3);
      expect(flowOn(laid)[0]!.y).toBeCloseTo(CONTENT_TOP + 40, 3);
    }
  });

  it('stacks several fixed views in template order with their margins', () => {
    const pages = paginate(
      page([
        fixed('top', 20),
        fixed('top', 10, { 'margin-top': '5', 'margin-bottom': '8' }),
        block(10),
        fixed('bottom', 12, { 'margin-top': '4' }),
        fixed('bottom', 6, { 'margin-bottom': '3' }),
      ]),
    );
    const [first, second, third, fourth] = fixedOn(pages[0]!);
    expect(first!.y).toBeCloseTo(CONTENT_TOP, 3);
    expect(second!.y).toBeCloseTo(CONTENT_TOP + 20 + 5, 3);
    expect(flowOn(pages[0]!)[0]!.y).toBeCloseTo(CONTENT_TOP + 20 + 5 + 10 + 8, 3);
    expect(bottom(fourth!)).toBeCloseTo(CONTENT_TOP + AREA - 3, 3);
    expect(bottom(third!)).toBeCloseTo(fourth!.y, 3);
  });

  it('puts bottom views above the page number', () => {
    const pages = paginate(page([block(10), fixed('bottom', 20), pageNumber()]));
    const [footer] = fixedOn(pages[0]!);
    expect(bottom(footer!)).toBeCloseTo(CONTENT_BOTTOM, 3);
    expect(pages[0]!.pageNumber?.y).toBeCloseTo(CONTENT_BOTTOM, 3);
  });

  it('ignores page breaks on fixed views and the page number, which are out of the flow', () => {
    const breaks = { 'break-before': 'page', 'break-after': 'page' };
    const pages = paginate(
      page([
        block(10),
        fixed('top', 20, breaks),
        block(10),
        fixed('bottom', 20, breaks),
        block(10),
        pageNumber({ height: String(NUMBER_HEIGHT), ...breaks }),
        block(10),
      ]),
    );
    expect(pages.map((laid) => flowOn(laid).length)).toEqual([4]);
  });

  it('ignores the break inputs on a fixed view and breaks inside its content', () => {
    const breaks = { 'break-before': 'page', 'break-after': 'page' };
    const header = el('pdf-view', { height: '20' }, [el('pdf-view', { height: '10', ...breaks })], {
      fixed: 'top',
      breakBefore: true,
      breakAfter: true,
    });
    const pages = paginate(page([block(10), header, block(10), block(10)]));
    expect(pages).toHaveLength(1);
  });

  it('throws when fixed views leave no room for content', () => {
    expect(() => paginate(page([fixed('top', 400), fixed('bottom', 400), block(10)]))).toThrow(
      'ngpdf: fixed views leave no room for content on pdf-page',
    );
  });

  it('lays out a fixed view below the page in the flow, with a warning', () => {
    const warn = vi.fn<(message: string) => void>();
    const inner = fixed('top', 10);
    const pages = paginate(page([el('pdf-view', {}, [block(10), inner])]), warn);
    expect(pages[0]!.placed.map((placed) => placed.box)).toContainEqual(
      expect.objectContaining({ node: inner }),
    );
    expect(warn).toHaveBeenCalledWith('ngpdf: a fixed pdf-view must be a direct child of pdf-page');
  });
});
